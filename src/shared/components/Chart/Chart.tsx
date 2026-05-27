import { useMemo } from "react"
import { ResponsiveLine } from "@nivo/line"
import { ResponsivePie } from "@nivo/pie"
import { ResponsiveBar } from "@nivo/bar"
import { ResponsiveRadialBar } from "@nivo/radial-bar"
import type { ChartConfig, LineSeries } from "./chart.types"
import { formatMoney, formatMoneyFull } from "../../utils/format"
import { useDarkMode } from "../../hooks/useDarkMode"

// ─── Theme ───────────────────────────────────────────────────────────────────

function buildNivoTheme(dark: boolean) {
  const subtext = dark ? "#9a8e82" : "#6b7a8d"
  const grid = dark ? "rgba(200,180,160,0.12)" : "rgba(25,55,90,0.10)"
  return {
    background: "transparent",
    text: { fill: subtext, fontSize: 11, fontFamily: "Figtree, -apple-system, sans-serif" },
    axis: {
      domain: { line: { stroke: "transparent", strokeWidth: 0 } },
      legend: { text: { fill: subtext, fontSize: 11 } },
      ticks: { line: { strokeWidth: 0 }, text: { fill: subtext, fontSize: 10 } },
    },
    grid: { line: { stroke: grid, strokeWidth: 1 } },
    legends: { text: { fill: subtext, fontSize: 11 } },
    tooltip: { container: { zIndex: 9999 }, zIndex: 9999 },
    crosshair: { line: { stroke: subtext, strokeWidth: 1, strokeOpacity: 0.4 } },
  }
}

const CHART_COLORS = [
  "#c27c3e",
  "#22c55e",
  "#3b82f6",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f59e0b",
  "#ec4899",
  "#14b8a6",
  "#84cc16",
]

// ─── Y-tick helper ────────────────────────────────────────────────────────────

function everyOtherYTicks(series: LineSeries[]): number[] | undefined {
  const allY = series
    .flatMap((s) => s.data.map((p) => p.y))
    .filter((v): v is number => typeof v === "number")
  if (allY.length === 0) return undefined
  const max = Math.max(0, ...allY)
  const min = Math.min(0, ...allY)
  const range = max - min
  if (range === 0) return undefined
  const rawStep = range / 8
  if (rawStep === 0) return undefined
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const niceStep = Math.ceil(rawStep / magnitude) * magnitude
  // When data spans negative values use niceStep so zero stays centered;
  // for all-positive data skip every other tick to reduce clutter.
  const step = min < 0 ? niceStep : niceStep * 2
  // Generate outward from 0 so zero is always a tick and spacing is uniform.
  const ticks: number[] = [0]
  for (let v = step; v <= max * 1.15; v += step) ticks.push(Math.round(v))
  for (let v = -step; v >= min * 1.15; v -= step) ticks.push(Math.round(v))
  ticks.sort((a, b) => a - b)
  return ticks.length > 1 ? ticks : undefined
}

// ─── Slice tooltip ────────────────────────────────────────────────────────────

function SliceTooltip({ slice, series, valueFormat, disableGrowth }: {
  slice: { points: readonly { data: { x: unknown; y: unknown }; seriesId: string }[] }
  series: LineSeries[]
  valueFormat?: (v: number) => string
  disableGrowth?: boolean
}) {
  const points = slice.points
  const xLabel = String(points[0]?.data?.x ?? "")
  const fmt = valueFormat ?? formatMoneyFull

  // Single-series: large value + optional growth vs previous data point
  if (series.length === 1) {
    const point = points[0]
    const currVal = point.data.y as number
    const seriesData = series[0]?.data ?? []
    const idx = seriesData.findIndex((p) => String(p.x) === xLabel)
    let growth: number | null = null
    if (!disableGrowth && idx > 0) {
      const prevVal = seriesData[idx - 1].y as number
      if (prevVal > 0 && currVal != null) {
        growth = ((currVal - prevVal) / Math.abs(prevVal)) * 100
      }
    }
    const growthColor = growth != null
      ? growth >= 0 ? "#22c55e" : "#ef4444"
      : undefined

    return (
      <div className="chart-line-tooltip">
        <div className="chart-line-tooltip-header">{xLabel}</div>
        <div className="chart-line-tooltip-single-value">{fmt(currVal)}</div>
        {growth != null && (
          <div className="chart-line-tooltip-growth" style={{ color: growthColor }}>
            {growth >= 0 ? "↗" : "↘"} {growth > 0 ? "+" : ""}{growth.toFixed(1)}% YoY
          </div>
        )}
      </div>
    )
  }

  // Multi-series: label + value rows, current year in primary color, growth row at bottom
  // Build rows for all series, not just points present in the slice.
  // Nivo uses "seriesId" (with s), not "serieId".
  const sliceMap = new Map(points.map((p) => [String(p.seriesId), p]))
  const rowsBySerie = series.map((s) => {
    const point = sliceMap.get(String(s.id))
    return { id: s.id, value: point != null ? (point.data.y as number | null) : null }
  })

  let growth: number | null = null
  if (rowsBySerie.length === 2) {
    const prev = rowsBySerie[0].value
    const curr = rowsBySerie[1].value
    if (prev != null && prev !== 0 && curr != null) {
      growth = ((curr - prev) / Math.abs(prev)) * 100
    }
  }
  const growthColor = growth != null
    ? growth >= 0 ? "#22c55e" : "#ef4444"
    : undefined

  return (
    <div className="chart-line-tooltip">
      <div className="chart-line-tooltip-header">{xLabel}</div>
      {rowsBySerie.map((row, i) => {
        const isCurrent = i === rowsBySerie.length - 1
        return (
          <div key={row.id} className="chart-line-tooltip-row">
            <span className="chart-line-tooltip-label">{row.id}</span>
            <span
              className="chart-line-tooltip-value"
              style={isCurrent && row.value != null ? { color: "var(--primary-color)" } : undefined}
            >
              {row.value != null ? formatMoneyFull(row.value) : "—"}
            </span>
          </div>
        )
      })}
      {growth != null && (
        <>
          <div className="chart-line-tooltip-divider" />
          <div className="chart-line-tooltip-growth-row">
            <span className="chart-line-tooltip-growth-label">Monthly Growth:</span>
            <span className="chart-line-tooltip-growth-value" style={{ color: growthColor }}>
              {growth >= 0 ? "↗" : "↘"} {growth > 0 ? "+" : ""}{growth.toFixed(1)}%
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

function BarChart({ config }: { config: Extract<ChartConfig, { type: "bar" }> }) {
  const { data, keys, indexBy, color = CHART_COLORS[0], colors, yFormat } = config

  const dark = useDarkMode()
  const nivoTheme = useMemo(() => buildNivoTheme(dark), [dark])

  // Stacked/multi-series mode when explicit keys are provided; otherwise treat
  // the data as simple { label, value } points.
  const stacked = Array.isArray(keys) && keys.length > 0
  const barKeys = stacked ? keys! : ["value"]
  const barIndexBy = stacked ? (indexBy ?? "label") : "label"
  const barColors = colors ?? (stacked ? CHART_COLORS : [color])
  const barData = (
    stacked
      ? (data as Record<string, unknown>[])
      : (data as { label: string; value: number }[]).map((d) => ({ label: d.label, value: d.value }))
  ) as Record<string, string | number>[]

  return (
    <ResponsiveBar
      data={barData}
      keys={barKeys}
      indexBy={barIndexBy}
      theme={nivoTheme}
      colors={barColors}
      margin={{ top: 20, right: 24, bottom: stacked ? 56 : 40, left: 68 }}
      padding={0.35}
      borderRadius={3}
      axisLeft={{
        tickSize: 0,
        tickPadding: 10,
        format: yFormat ?? ((v) => formatMoney(v as number)),
      }}
      axisBottom={{
        tickSize: 0,
        tickPadding: 12,
      }}
      enableGridX={false}
      enableLabel={false}
      animate
      motionConfig={{ tension: 120, friction: 14 }}
      legends={
        stacked
          ? [
              {
                dataFrom: "keys",
                anchor: "bottom",
                direction: "row",
                translateY: 52,
                itemsSpacing: 12,
                itemWidth: 80,
                itemHeight: 16,
                symbolSize: 10,
                symbolShape: "circle",
              },
            ]
          : []
      }
      tooltip={({ id, value, indexValue }) => (
        <div className="chart-tooltip">
          <span>{stacked ? `${String(indexValue)} · ${String(id)}` : String(indexValue)}</span>
          <strong>{formatMoneyFull(value as number)}</strong>
        </div>
      )}
    />
  )
}

// ─── Radial bar chart ────────────────────────────────────────────────────────

function RadialBarChart({ config }: { config: Extract<ChartConfig, { type: "radial-bar" }> }) {
  const { data, colors = CHART_COLORS, valueFormat: valueFmt } = config

  const dark = useDarkMode()
  const nivoTheme = useMemo(() => buildNivoTheme(dark), [dark])
  const fmt = valueFmt ?? formatMoneyFull
  const trackColor = dark ? "rgba(148,163,184,0.08)" : "rgba(25,55,90,0.06)"

  return (
    <ResponsiveRadialBar
      data={data}
      theme={nivoTheme}
      colors={colors}
      margin={{ top: 28, right: 120, bottom: 28, left: 28 }}
      padding={0.3}
      cornerRadius={3}
      innerRadius={0.25}
      enableTracks
      tracksColor={trackColor}
      enableRadialGrid={false}
      enableCircularGrid
      radialAxisStart={null}
      circularAxisOuter={{ tickSize: 0, tickPadding: 8 }}
      enableLabels={false}
      animate
      motionConfig={{ tension: 120, friction: 14 }}
      legends={[
        {
          anchor: "right",
          direction: "column",
          justify: false,
          translateX: 100,
          translateY: 0,
          itemsSpacing: 4,
          itemWidth: 90,
          itemHeight: 18,
          itemDirection: "left-to-right",
          symbolSize: 8,
          symbolShape: "circle",
        },
      ]}
      tooltip={({ bar }) => (
        <div className="chart-tooltip">
          <span className="chart-tooltip-dot" style={{ background: bar.color }} />
          <span>{bar.groupId} — {bar.category}</span>
          <strong>{fmt(bar.value)}</strong>
        </div>
      )}
    />
  )
}

// ─── Line chart ───────────────────────────────────────────────────────────────

function LineChart({ config }: { config: Extract<ChartConfig, { type: "line" }> }) {
  const { series, yFormat, enableArea = true, legend = false, curve = "catmullRom", axisBottomTickValues, axisBottomFormat, disableGrowthTooltip } = config

  const dark = useDarkMode()
  const isMobile = window.innerWidth <= 768
  const nivoTheme = useMemo(() => buildNivoTheme(dark), [dark])
  const yTicks = everyOtherYTicks(series)
  const hasSeriesColors = series.some((s) => s.color)
  const marginTop = legend ? 40 : 20

  const allY = series.flatMap((s) => s.data.map((p) => p.y)).filter((v): v is number => typeof v === "number")
  const minY = allY.length > 0 ? Math.min(...allY) : 0
  const yMin = minY >= 0 ? 0 : "auto"

  return (
    <ResponsiveLine
      data={series}
      theme={nivoTheme}
      colors={hasSeriesColors ? (serie: { color?: string }) => serie.color ?? CHART_COLORS[0] : CHART_COLORS}
      margin={{ top: marginTop, right: isMobile ? 12 : 24, bottom: 48, left: isMobile ? 48 : 68 }}
      xScale={{ type: "point" }}
      yScale={{ type: "linear", min: yMin, max: "auto", stacked: false }}
      curve={curve}
      animate
      motionConfig={{ mass: 1, tension: 120, friction: 14, clamp: false, precision: 0.01, velocity: 0 }}
      enableArea={enableArea}
      areaOpacity={0.12}
      enablePoints
      pointSize={6}
      pointColor="#ffffff"
      pointBorderWidth={2}
      pointBorderColor={{ from: "seriesColor" }}
      enableSlices="x"
      tooltip={() => null}
      sliceTooltip={({ slice }) => <SliceTooltip slice={slice} series={series} valueFormat={yFormat} disableGrowth={disableGrowthTooltip} />}
      axisLeft={{
        tickSize: 0,
        tickPadding: 10,
        tickValues: yTicks,
        format: yFormat ?? ((v) => formatMoney(v as number)),
      }}
      axisBottom={{
        tickSize: 0,
        tickPadding: 18,
        tickValues: axisBottomTickValues,
        format: axisBottomFormat,
      }}
      gridYValues={yTicks ?? 5}
      enableGridX={false}
      enableCrosshair
      crosshairType="x"
      lineWidth={2}
      legends={
        legend
          ? [
              {
                anchor: "top-right",
                direction: "row",
                justify: false,
                translateX: 0,
                translateY: -marginTop + 6,
                itemsSpacing: 16,
                itemDirection: "left-to-right",
                itemWidth: 48,
                itemHeight: 20,
                itemOpacity: 0.9,
                symbolSize: 8,
                symbolShape: "circle",
              },
            ]
          : []
      }
    />
  )
}

// ─── Pie with ranked list ─────────────────────────────────────────────────────

function PieWithList({ config }: { config: Extract<ChartConfig, { type: "pie-with-list" }> }) {
  const {
    items,
    previewCount = 5,
    valueFormat = formatMoney,
    onItemClick,
    colors = CHART_COLORS,
    centerLabel,
    showPercent = false,
    chartSize = "sm",
    centerTotal,
  } = config
  const preview = items.slice(0, previewCount)

  const dark = useDarkMode()
  const nivoTheme = useMemo(() => buildNivoTheme(dark), [dark])

  const pieData = preview.map((item, i) => ({
    id: item.id,
    label: item.label,
    value: item.value,
    color: colors[i % colors.length],
  }))

  const listTotal = preview.reduce((sum, item) => sum + item.value, 0)
  const total = centerTotal != null ? centerTotal : listTotal

  const primaryFill = dark ? "#e2e8f0" : "#1e293b"
  const subtextFill = dark ? "#94a3b8" : "#64748b"

  function CenterLayer({ centerX, centerY }: { centerX: number; centerY: number }) {
    return (
      <>
        <text
          x={centerX}
          y={centerY - 9}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: 16, fontWeight: 700, fontFamily: "Figtree, -apple-system, sans-serif", fill: primaryFill }}
        >
          {formatMoney(total)}
        </text>
        <text
          x={centerX}
          y={centerY + 10}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: 8, letterSpacing: "0.06em", fontFamily: "Figtree, -apple-system, sans-serif", fill: subtextFill }}
        >
          {centerLabel}
        </text>
      </>
    )
  }

  return (
    <div className="pie-with-list">
      <div
        className={`pie-with-list-chart pie-with-list-chart--${chartSize}`}
        onClick={onItemClick ? (e) => e.stopPropagation() : undefined}
      >
        <ResponsivePie
          data={pieData}
          theme={nivoTheme}
          colors={{ datum: "data.color" }}
          margin={{ top: 12, right: 12, bottom: 12, left: 12 }}
          innerRadius={0.55}
          padAngle={2}
          cornerRadius={3}
          activeOuterRadiusOffset={6}
          enableArcLabels={false}
          enableArcLinkLabels={false}
          animate
          motionConfig={{ tension: 120, friction: 14 }}
          layers={
            centerLabel
              ? ["arcs", "arcLabels", "arcLinkLabels", "legends", CenterLayer]
              : ["arcs", "arcLabels", "arcLinkLabels", "legends"]
          }
          onClick={onItemClick ? (datum) => onItemClick(String(datum.id)) : undefined}
          tooltip={({ datum }) => {
            const pct = total > 0 ? ((datum.value as number) / total) * 100 : 0
            return (
              <div className="chart-tooltip">
                <span className="chart-tooltip-dot" style={{ background: datum.color }} />
                <span>{datum.label}</span>
                <strong>{valueFormat(datum.value as number)}</strong>
                <span className="chart-tooltip-pct">({pct.toFixed(1)}%)</span>
              </div>
            )
          }}
        />
      </div>

      <ol className="spend-list">
        {preview.map((item, i) => {
          const pct = total > 0 ? (item.value / total) * 100 : 0
          return (
            <li
              key={item.id}
              className={`spend-list-item${onItemClick ? " spend-list-item-clickable" : ""}`}
              onClick={onItemClick ? (e) => { e.stopPropagation(); onItemClick(item.id) } : undefined}
            >
              <span
                className="spend-list-dot"
                style={{ background: colors[i % colors.length] }}
              />
              <span className="spend-list-name body-text">{item.label}</span>
              {showPercent && (
                <span className="spend-list-percent body-text">
                  {pct.toFixed(1)}%
                </span>
              )}
              <span className="spend-list-value body-text emphasized">
                {valueFormat(item.value)}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export function Chart({ config }: { config: ChartConfig }) {
  switch (config.type) {
    case "bar":
      return (
        <div className="chart-container">
          <BarChart config={config} />
        </div>
      )
    case "radial-bar":
      return (
        <div className="chart-container">
          <RadialBarChart config={config} />
        </div>
      )
    case "line":
      return (
        <div className="chart-container">
          <LineChart config={config} />
        </div>
      )
    case "pie-with-list":
      return <PieWithList config={config} />
  }
}
