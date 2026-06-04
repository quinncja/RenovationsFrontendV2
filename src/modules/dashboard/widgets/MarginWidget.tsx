import { useMemo } from "react"
import { Widget } from "../../../shared/components/Widget/Widget"
import { Chart } from "../../../shared/components/Chart/Chart"
import { useWidgetData, usePageYear } from "../../../shared/context/PageContext"
import { formatPercent, shortMonth } from "../../../shared/utils/format"
import useIsMobile from "../../../shared/hooks/useIsMobile"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import type { LineMarker } from "../../../shared/components/Chart/chart.types"

interface MarginRow {
  month: number
  margin_percentage: number
}

interface OpenMonthPayload {
  openMonthPeriod?: number
  openMonthYear?: number
}

const OPEN_MARKER_COLOR = "#94a3b8" // matches the line charts' "Open" reference

// Bar color by margin health, mirroring the old frontend's thresholds.
function marginColor(margin: number): string {
  if (margin >= 20) return "#22c55e" // green
  if (margin >= 17) return "#f59e0b" // amber
  return "#ef4444" // red
}

// marginPerformance returns one row per month for the selected year; plot the
// monthly margin_percentage as bars (like the old Monthly Margin Performance).
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

export function MarginWidget() {
  const pageYear = usePageYear()
  const marginColorsOn = useMarginColorsEnabled()
  const { data, isLoading } = useWidgetData<{
    marginPerformance: MarginRow[] | null
    openMonthFinances: OpenMonthPayload | null
  }>(["marginPerformance", "openMonthFinances"])

  const chart = useMemo(() => {
    const raw = data?.marginPerformance
    if (!Array.isArray(raw)) return null

    // Always emit all 12 months so future/empty months still show their
    // label on the x-axis. Months the backend didn't return (no posted
    // activity yet) render as 0-height bars — the label still appears,
    // the chart axis always reads Jan→Dec.
    const byMonth = new Map<number, number>()
    for (const d of raw) {
      if (d.month >= 1 && d.month <= 12) byMonth.set(d.month, d.margin_percentage)
    }
    const bars = MONTHS.map((m) => ({
      label: shortMonth(m),
      value: byMonth.get(m) ?? 0,
    }))
    const values = bars.map((b) => b.value)

    // Round a magnitude up to the next "nice" step so bounds/ticks read cleanly.
    const NICE = [10, 20, 30, 50, 100, 200, 300, 500, 1000]
    const niceMag = (v: number) => NICE.find((m) => m >= Math.abs(v)) ?? Math.ceil(Math.abs(v) / 1000) * 1000

    const dataMin = Math.min(0, ...values)
    const dataMax = Math.max(0, ...values)
    const minValue = dataMin < 0 ? -niceMag(dataMin) : 0
    const maxValue = dataMax > 0 ? niceMag(dataMax) : 10

    // Keep the "normal" months (everything but the single biggest outlier) inside
    // the symlog linear zone so they stay comparable; only extremes get
    // log-compressed. Floor at 30% so typical margins aren't over-compressed.
    const absDesc = values.map(Math.abs).sort((a, b) => b - a)
    const inlier = absDesc[1] ?? absDesc[0] ?? 30
    const scaleConstant = Math.max(30, Math.ceil(inlier / 10) * 10)

    // A few log-spaced ticks → far fewer labels than a linear axis would need.
    const candidates = [20, 50, 100, 200, 300, 500, 1000]
    const ticks = [0]
    for (const m of candidates) {
      if (-m >= minValue) ticks.push(-m)
      if (m <= maxValue) ticks.push(m)
    }
    ticks.sort((a, b) => a - b)

    return { bars, minValue, maxValue, scaleConstant, ticks }
  }, [data?.marginPerformance])

  // Vertical "Open" reference at the in-progress month — same visual
  // language as the four monthly line charts on the home page. Only
  // rendered when the page year matches the actually-open year (otherwise
  // the marker would float over a bar that has nothing to do with "now").
  const open = data?.openMonthFinances ?? null
  const openMonth = open?.openMonthPeriod ?? null
  const openYear = open?.openMonthYear ?? null
  const markers = useMemo<LineMarker[] | undefined>(() => {
    if (openMonth == null || openYear == null) return undefined
    if (pageYear !== openYear) return undefined
    return [
      {
        axis: "x",
        value: shortMonth(openMonth),
        legend: "Open",
        legendOrientation: "vertical",
        legendPosition: "top",
        lineStyle: {
          stroke: OPEN_MARKER_COLOR,
          strokeWidth: 1.25,
          strokeDasharray: "4 4",
          strokeOpacity: 0.7,
        },
        textStyle: {
          fill: OPEN_MARKER_COLOR,
          fontSize: 10,
          fontWeight: 600,
        },
      },
    ]
  }, [openMonth, openYear, pageYear])

  // Mobile: twelve month labels crowd the x axis — show every other one.
  const isMobile = useIsMobile()
  const axisBottomTickValues = useMemo(
    () => (isMobile && chart ? chart.bars.filter((_, i) => i % 2 === 0).map((b) => b.label) : undefined),
    [isMobile, chart]
  )

  return (
    <Widget title="Monthly Margin Performance" loading={isLoading} noData={!chart}>
      {chart && (
        <Chart
          config={{
            type: "bar",
            data: chart.bars,
            yFormat: formatPercent,
            colorBy: marginColorsOn ? marginColor : undefined,
            scaleType: "symlog",
            scaleConstant: chart.scaleConstant,
            minValue: chart.minValue,
            maxValue: chart.maxValue,
            axisLeftTickValues: chart.ticks,
            axisBottomTickValues,
            emphasizeZero: true,
            markers,
          }}
        />
      )}
    </Widget>
  )
}
