import { useEffect, useMemo, useRef, useState, type ComponentType } from "react"
import { Line } from "@nivo/line"
import { Pie } from "@nivo/pie"
import { Bar } from "@nivo/bar"
import { RadialBar } from "@nivo/radial-bar"
import { useTooltip } from "@nivo/tooltip"
import type { ChartConfig, LineSeries } from "./chart.types"
import { formatMoney, formatMoneyFull } from "../../utils/format"
import { useDarkMode } from "../../hooks/useDarkMode"

// ─── Zoom-safe sizing ─────────────────────────────────────────────────────────
// nivo's Responsive* components measure their container with
// getBoundingClientRect, which returns *visual* pixels. Under the dashboard's
// zoom-to-fit (CSS `zoom` on small screens) that double-shrinks every chart:
// the SVG renders at the zoomed size and is then zoomed again. ResizeObserver
// boxes are reported in *layout* pixels — zoom-independent — so we measure
// ourselves and feed explicit sizes to the non-responsive nivo components.
// (nivo's cursor math self-corrects under zoom via its getBBox ratio, so
// tooltips stay accurate.)
function withLayoutSize<P extends { width: number; height: number }>(Component: ComponentType<P>) {
  return function LayoutSized(props: Omit<P, "width" | "height">) {
    const ref = useRef<HTMLDivElement>(null)
    const [size, setSize] = useState<{ width: number; height: number } | null>(null)
    useEffect(() => {
      // Measure the PARENT (like AutoSizer did) — our own div is 0×0 so the
      // chart never contributes to the container's size. Sizing the chart from
      // a box it also grows would feed back into itself and inflate forever.
      const parent = ref.current?.parentElement
      if (!parent) return
      const ro = new ResizeObserver(([entry]) => {
        // contentRect: content box (excl. padding), in layout px.
        setSize({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        })
      })
      ro.observe(parent)
      return () => ro.disconnect()
    }, [])
    return (
      <div ref={ref} style={{ width: 0, height: 0, overflow: "visible" }}>
        {size && size.width > 0 && size.height > 0 ? (
          <Component {...(props as P)} width={size.width} height={size.height} />
        ) : null}
      </div>
    )
  }
}
const SizedBar = withLayoutSize(Bar)
const SizedRadialBar = withLayoutSize(RadialBar)
// Instantiation expression pins the generic to the app's series shape — the
// wrapper can't infer it from `data` the way ResponsiveLine did.
const SizedLine = withLayoutSize(Line<LineSeries>)
const SizedPie = withLayoutSize(Pie)

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

  // Convention for 2-series comparison charts: the FIRST series is the current
  // period (nivo paints series[0] on top), the SECOND is the prior period.
  const currentRow = rowsBySerie[0]
  const prevRow = rowsBySerie[1]
  let growth: number | null = null
  if (rowsBySerie.length === 2 && currentRow.value != null && prevRow.value != null && prevRow.value !== 0) {
    growth = ((currentRow.value - prevRow.value) / Math.abs(prevRow.value)) * 100
  }
  const growthColor = growth != null
    ? growth >= 0 ? "#22c55e" : "#ef4444"
    : undefined

  // Display chronologically (prior first, current last) regardless of paint order.
  const orderedRows = rowsBySerie.length === 2 ? [prevRow, currentRow] : rowsBySerie

  return (
    <div className="chart-line-tooltip">
      <div className="chart-line-tooltip-header">{xLabel}</div>
      {orderedRows.map((row) => {
        const isCurrent = row.id === currentRow.id
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
  const { data, keys, indexBy, color = CHART_COLORS[0], colors, colorBy, yFormat, minValue = "auto", maxValue = "auto", axisLeftTickValues, axisBottomTickValues, scaleType = "linear", scaleConstant, emphasizeZero, groupTooltip, tooltipTotalLabel, markers: configMarkers, hideLegend, onBarClick } = config

  const dark = useDarkMode()
  const nivoTheme = useMemo(() => buildNivoTheme(dark), [dark])

  // Stacked/multi-series mode when explicit keys are provided; otherwise treat
  // the data as simple { label, value } points.
  // Guard against non-array data (unexpected backend shapes) so a bad payload
  // renders an empty chart instead of crashing the page (nivo calls data.map).
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : []
  const stacked = Array.isArray(keys) && keys.length > 0
  const barKeys = stacked ? keys! : ["value"]
  const barIndexBy = stacked ? (indexBy ?? "label") : "label"
  // Per-bar coloring (simple bars only) takes precedence over the palette.
  const barColors =
    colorBy && !stacked
      ? (d: { data: Record<string, unknown> }) => colorBy(Number(d.data.value))
      : colors ?? (stacked ? CHART_COLORS : [color])
  const barData = (
    stacked
      ? rows
      : rows.map((d) => ({ label: d.label, value: d.value }))
  ) as Record<string, string | number>[]
  const tooltipFormat = yFormat ?? formatMoneyFull

  const zeroLineColor = dark ? "rgba(220,205,185,0.45)" : "rgba(25,55,90,0.40)"
  // Faint column highlight painted behind the hovered category's bars.
  const sliceHighlight = dark ? "rgba(255,255,255,0.07)" : "rgba(15,23,42,0.06)"
  // Y-axis markers (zero-line + any caller-supplied horizontal lines) go
  // through nivo's built-in `markers` prop. X-axis markers go to a custom
  // layer below — nivo's built-in bar markers anchor at the band's *start*
  // edge (left side of the bar) rather than the center, so the line lands
  // off-center on the open-month bar. The custom layer reads each bar's
  // computed `x + width/2` for a true center; visual style (color, dash,
  // label position above the plot area) matches the line-chart markers so
  // both chart types render the "Open" cue identically.
  const xMarkers = useMemo(
    () => (configMarkers ?? []).filter((m) => m.axis === "x"),
    [configMarkers]
  )
  const nivoMarkers = useMemo(() => {
    const list: NonNullable<typeof configMarkers> = []
    if (emphasizeZero) {
      list.push({
        axis: "y",
        value: 0,
        lineStyle: { stroke: zeroLineColor, strokeWidth: 1.5 },
      })
    }
    for (const m of configMarkers ?? []) {
      if (m.axis !== "x") list.push(m)
    }
    return list.length > 0 ? list : undefined
  }, [emphasizeZero, configMarkers, zeroLineColor])

  const marginTop = 20

  // Custom layer: vertical line through the band CENTER. The label sits
  // in the chart's bottom margin (alongside the month tick labels) so
  // the Open text and the "May" tick read on the same baseline — putting
  // it in the top margin like the line charts looked asymmetric since
  // the bar's category axis lives at the bottom. The line spans only the
  // plot area (y=0 → y=height), not into the bottom margin, so it stops
  // cleanly at the x-axis.
  type BandBar = { data: { indexValue: string | number }; x: number; width: number }
  // nivo passes `height` as the FULL canvas height; the plot area is
  // `innerHeight`. The layer's <g> is already translated by margin.top, so
  // we measure against innerHeight — using `height` would push the line past
  // the x-axis and shove the label below the SVG (clipped, so it vanishes).
  const BarXMarkersLayer = ({ bars, innerHeight }: { bars: readonly BandBar[]; innerHeight: number }) => {
    if (xMarkers.length === 0) return null
    // Sits ~6px below the plot's bottom edge — same vertical band as the
    // bar chart's axisBottom tickPadding (12), so the Open label is
    // visually adjacent to the month label.
    const labelY = innerHeight + 18
    return (
      <g pointerEvents="none">
        {xMarkers.map((m, i) => {
          const bar = bars.find((b) => String(b.data.indexValue) === String(m.value))
          if (!bar) return null
          const cx = bar.x + bar.width / 2
          const stroke = m.lineStyle?.stroke ?? "currentColor"
          const strokeWidth = m.lineStyle?.strokeWidth ?? 1
          const strokeOpacity = m.lineStyle?.strokeOpacity ?? 1
          const strokeDasharray = m.lineStyle?.strokeDasharray
          // Vertical "Open"-style label sits centered above the line, which then
          // starts below it; horizontal labels keep the full-height line + bottom text.
          const vertical = m.legend != null && m.legendOrientation === "vertical"
          const labelBottom = 30
          const lineTop = vertical ? labelBottom + 10 : 0
          return (
            <g key={i}>
              <line
                x1={cx}
                x2={cx}
                y1={lineTop}
                y2={innerHeight}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeOpacity={strokeOpacity}
                strokeDasharray={strokeDasharray}
              />
              {m.legend &&
                (vertical ? (
                  // Vertical label reading bottom→top, centered on the line, with
                  // the line starting below it — matches the line charts' "Open" cue.
                  <text
                    transform={`translate(${cx}, ${labelBottom}) rotate(-90)`}
                    textAnchor="start"
                    dominantBaseline="central"
                    fill={m.textStyle?.fill ?? stroke}
                    fontSize={m.textStyle?.fontSize ?? 10}
                    fontWeight={m.textStyle?.fontWeight ?? 600}
                  >
                    {m.legend}
                  </text>
                ) : (
                  <text
                    x={cx}
                    y={labelY}
                    textAnchor="middle"
                    fill={m.textStyle?.fill ?? stroke}
                    fontSize={m.textStyle?.fontSize ?? 10}
                    fontWeight={m.textStyle?.fontWeight ?? 600}
                  >
                    {m.legend}
                  </text>
                ))}
            </g>
          )
        })}
      </g>
    )
  }

  // Slice tooltip: one combined card per category showing every key's value
  // plus their signed difference, mirroring the line chart's slice tooltip.
  // Values render as magnitudes (matching an absolute-valued axis); the
  // difference keeps its sign and is colored good/bad.
  const stackedPalette = Array.isArray(colors) ? colors : CHART_COLORS
  const groupTooltipOn = Boolean(groupTooltip) && stacked
  const GroupTooltip = ({ indexValue, row }: { indexValue: string; row: Record<string, unknown> }) => {
    const diff = barKeys.reduce((sum, k) => sum + (Number(row[k]) || 0), 0)
    const diffColor = diff >= 0 ? "#22c55e" : "#ef4444"
    return (
      <div className="chart-line-tooltip">
        <div className="chart-line-tooltip-header">{indexValue}</div>
        {barKeys.map((k, i) => (
          <div key={k} className="chart-line-tooltip-row">
            <span className="chart-line-tooltip-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span className="chart-tooltip-dot" style={{ background: stackedPalette[i % stackedPalette.length] }} />
              {k}
            </span>
            <span className="chart-line-tooltip-value">{formatMoneyFull(Math.abs(Number(row[k]) || 0))}</span>
          </div>
        ))}
        <div className="chart-line-tooltip-divider" />
        <div className="chart-line-tooltip-growth-row">
          <span className="chart-line-tooltip-growth-label">{tooltipTotalLabel ?? "Net"}</span>
          <span className="chart-line-tooltip-growth-value" style={{ color: diffColor }}>
            {diff > 0 ? "+" : ""}{formatMoneyFull(diff)}
          </span>
        </div>
      </div>
    )
  }

  type SliceBar = { data: { indexValue: string | number; data: Record<string, unknown> }; x: number; width: number }
  const BarSliceLayer = ({
    bars,
    innerHeight,
    yScale,
  }: {
    bars: readonly SliceBar[]
    innerHeight: number
    // nivo's value scale; for this y-axis it's callable with a number.
    yScale: unknown
  }) => {
    const valueToY = yScale as (v: number) => number
    const { showTooltipFromEvent, hideTooltip } = useTooltip()
    const [hovered, setHovered] = useState<string | null>(null)
    if (!groupTooltipOn && !onBarClick) return null
    // Collapse the per-key bars into one transparent full-height band per
    // category. Each band shares its segments' x/width (stacked), and carries
    // the original data row so the tooltip can read every key at once. The same
    // band intercepts clicks, so the whole column is a click target.
    const bands = new Map<string, { x: number; width: number; row: Record<string, unknown> }>()
    for (const b of bars) {
      const key = String(b.data.indexValue)
      if (!bands.has(key)) bands.set(key, { x: b.x, width: b.width, row: b.data.data })
    }
    const hoveredBand = hovered != null ? bands.get(hovered) : undefined
    return (
      <g>
        {hoveredBand && (
          <rect
            x={hoveredBand.x - 3}
            y={0}
            width={hoveredBand.width + 6}
            height={innerHeight}
            rx={6}
            fill={sliceHighlight}
            pointerEvents="none"
          />
        )}
        {[...bands.entries()].map(([key, band]) => (
          <rect
            key={key}
            x={band.x}
            y={0}
            width={band.width}
            height={innerHeight}
            fill="transparent"
            pointerEvents="all"
            style={onBarClick ? { cursor: "pointer" } : undefined}
            onMouseEnter={(e) => {
              setHovered(key)
              if (groupTooltipOn) showTooltipFromEvent(<GroupTooltip indexValue={key} row={band.row} />, e)
            }}
            onMouseMove={groupTooltipOn ? (e) => showTooltipFromEvent(<GroupTooltip indexValue={key} row={band.row} />, e) : undefined}
            onMouseLeave={() => {
              setHovered(null)
              if (groupTooltipOn) hideTooltip()
            }}
            onClick={
              onBarClick
                ? (e) => {
                    // For a two-key diverging chart, report which key was clicked
                    // from the cursor's side of the zero line (key 0 above, 1 below).
                    let segKey: string | undefined
                    if (barKeys.length === 2) {
                      const top = (e.currentTarget as SVGRectElement).getBoundingClientRect().top
                      segKey = e.clientY - top < valueToY(0) ? barKeys[0] : barKeys[1]
                    }
                    onBarClick(key, segKey)
                  }
                : undefined
            }
          />
        ))}
      </g>
    )
  }

  return (
    <SizedBar
      data={barData}
      keys={barKeys}
      indexBy={barIndexBy}
      theme={nivoTheme}
      colors={barColors}
      margin={{ top: marginTop, right: 24, bottom: stacked && !hideLegend ? 56 : 40, left: 68 }}
      padding={0.35}
      borderRadius={3}
      valueScale={
        scaleType === "symlog"
          ? { type: "symlog", constant: scaleConstant, min: minValue, max: maxValue }
          : { type: "linear", min: minValue, max: maxValue }
      }
      axisLeft={{
        tickSize: 0,
        tickPadding: 10,
        tickValues: axisLeftTickValues,
        format: yFormat ?? ((v) => formatMoney(v as number)),
      }}
      axisBottom={{
        tickSize: 0,
        tickPadding: 12,
        tickValues: axisBottomTickValues,
      }}
      gridYValues={axisLeftTickValues}
      markers={nivoMarkers}
      // Keep interactivity on: nivo only mounts its <Tooltip> renderer when
      // isInteractive is true, so the slice tooltip needs it. The slice layer's
      // bands sit topmost (last) and intercept hovers, so the bars beneath
      // never fire their own per-segment tooltip — no double tooltip.
      layers={["grid", "axes", "bars", "markers", "legends", "annotations", BarXMarkersLayer, BarSliceLayer]}
      enableGridX={false}
      enableLabel={false}
      animate
      motionConfig={{ tension: 120, friction: 14 }}
      legends={
        stacked && !hideLegend
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
          <strong>{tooltipFormat(value as number)}</strong>
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
    <SizedRadialBar
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

// Custom nivo line layer: renders a static dot + animated pulse ring at a
// single data point identified by series id + x value. Placed above the
// default points layer so it sits on top of the standard small dot. Bails
// out silently if the target point isn't in the rendered data.
interface PulsePointConfig { seriesId: string; xValue: string | number; color?: string }
type NivoComputedSeries = {
  id: string | number
  color?: string
  data: readonly { position: { x: number; y: number }; data: { x: string | number; y: number | null } }[]
}
function buildPulseLayer(pulse: PulsePointConfig | undefined) {
  if (!pulse) return null
  return ({ series }: { series: readonly NivoComputedSeries[] }) => {
    const s = series.find((ser) => String(ser.id) === String(pulse.seriesId))
    if (!s) return null
    const pt = s.data.find((d) => String(d.data.x) === String(pulse.xValue))
    if (!pt || pt.data.y == null) return null
    const color = pulse.color ?? s.color ?? CHART_COLORS[0]
    // Verbatim port of the old frontend's pointSymbol pulse: 4 circles
    // wrapped in a <g> translated to the point. Inner circles use the
    // default cx=0/cy=0 so the pulseCore transform: scale() animates
    // around the circle's own center (without the wrapping translate
    // the scale would happen around the SVG origin and the dot would
    // slide as it pulsed). `size/2 = 3` matches the old code's default
    // nivo point size of 6.
    const SIZE = 6
    const BORDER_WIDTH = 2
    return (
      <g transform={`translate(${pt.position.x}, ${pt.position.y})`} pointerEvents="none">
        <circle
          className="pulse-ring-outer"
          r={8}
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeOpacity={0.25}
          style={{
            animation: "pulseOuter 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite",
          }}
        />
        <circle
          className="pulse-ring-inner"
          r={6}
          fill={color}
          fillOpacity={0.08}
          style={{
            animation: "pulseInner 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite",
          }}
        />
        <circle
          r={SIZE / 2}
          fill="#ffffff"
          style={{ animation: "pulseCore 2.5s ease-in-out infinite" }}
        />
        <circle
          r={SIZE / 2}
          fill="none"
          stroke={color}
          strokeWidth={BORDER_WIDTH}
        />
      </g>
    )
  }
}

function LineChart({ config }: { config: Extract<ChartConfig, { type: "line" }> }) {
  const { series, yFormat, enableArea = true, legend = false, curve = "catmullRom", axisBottomTickValues, axisBottomFormat, disableGrowthTooltip, markers, pulsePoint, highlightedX, onPointClick } = config

  const dark = useDarkMode()
  const isMobile = window.innerWidth <= 768
  const nivoTheme = useMemo(() => buildNivoTheme(dark), [dark])
  const yTicks = everyOtherYTicks(series)
  const hasSeriesColors = series.some((s) => s.color)
  const marginTop = legend ? 40 : 20
  // "Muted" mode: when the caller is highlighting a specific x value, all
  // series fade to gray and the single matching point paints in its
  // own series color. Communicates "this is what you clicked" without
  // dropping the rest of the line off the chart.
  const muted = highlightedX != null && highlightedX !== ""
  const MUTED_COLOR = "#94a3b8"
  const seriesColorById = useMemo(() => {
    const map = new Map<string, string>()
    series.forEach((s, i) => {
      map.set(String(s.id), s.color ?? CHART_COLORS[i % CHART_COLORS.length])
    })
    return map
  }, [series])

  const allY = series.flatMap((s) => s.data.map((p) => p.y)).filter((v): v is number => typeof v === "number")
  const minY = allY.length > 0 ? Math.min(...allY) : 0
  const yMin = minY >= 0 ? 0 : "auto"

  return (
    <SizedLine
      data={series}
      theme={nivoTheme}
      colors={
        muted
          ? () => MUTED_COLOR
          : hasSeriesColors
            ? (serie: { color?: string }) => serie.color ?? CHART_COLORS[0]
            : CHART_COLORS
      }
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
      pointColor={
        muted
          ? ((ctx: { point: { data: { x: unknown }; seriesId: string } }) =>
              String(ctx.point.data.x) === highlightedX
                ? (seriesColorById.get(String(ctx.point.seriesId)) ?? CHART_COLORS[0])
                : "#ffffff") as never
          : "#ffffff"
      }
      pointBorderWidth={2}
      pointBorderColor={
        muted
          ? ((point: { data: { x: unknown }; seriesId: string }) =>
              String(point.data.x) === highlightedX
                ? (seriesColorById.get(String(point.seriesId)) ?? CHART_COLORS[0])
                : MUTED_COLOR) as never
          : { from: "seriesColor" }
      }
      onClick={
        onPointClick
          ? ((target: unknown) => {
              // With slices enabled, nivo invokes onClick with the slice
              // object (carries `points`); without slices it's a point
              // directly. Handle both shapes so the click works regardless
              // of nivo internals.
              const t = target as {
                data?: { x?: unknown }
                points?: { data: { x: unknown } }[]
              }
              const x = t.data?.x ?? t.points?.[0]?.data?.x
              if (x != null) onPointClick(String(x))
            }) as never
          : undefined
      }
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
      markers={markers}
      // Layers: default nivo order with the optional pulse layer appended
      // last so the pulsing dot paints on top of the standard points.
      layers={[
        "grid",
        "markers",
        "axes",
        "areas",
        "crosshair",
        "lines",
        "points",
        "slices",
        "mesh",
        "legends",
        ...(pulsePoint ? [buildPulseLayer(pulsePoint)!] : []),
      ]}
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
        <SizedPie
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
