import { useMemo } from "react"
import { Widget } from "../../../shared/components/Widget/Widget"
import { Chart } from "../../../shared/components/Chart/Chart"
import { useWidgetData, usePageYear } from "../../../shared/context/PageContext"
import { formatPercent, marginTextColor, shortMonth } from "../../../shared/utils/format"
import useIsMobile from "../../../shared/hooks/useIsMobile"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import useIncludeOverUnder from "../../../shared/hooks/useIncludeOverUnder"
import type { LineMarker } from "../../../shared/components/Chart/chart.types"

interface MarginRow {
  month: number
  // null when billed revenue for the month is non-positive (no meaningful
  // margin — the backend guards `revenue > 0`).
  margin_percentage: number | null
  // Needed to recompute the open-month bar when over/under is folded in.
  revenue?: number
  total_expenses?: number
}

interface OpenMonthPayload {
  openMonthPeriod?: number
  openMonthYear?: number
  openMonthOverUnder?: number
}

const OPEN_MARKER_COLOR = "#94a3b8" // matches the line charts' "Open" reference

// marginPerformance returns one row per month for the selected year; plot the
// monthly margin_percentage as bars (like the old Monthly Margin Performance).
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

export function MarginWidget() {
  const pageYear = usePageYear()
  const marginColorsOn = useMarginColorsEnabled()
  const [includeOverUnder] = useIncludeOverUnder()
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
      // Skip null margins (non-positive-revenue months); they fall through to
      // the 0-height bar below rather than plotting a bogus value.
      if (d.month >= 1 && d.month <= 12 && d.margin_percentage != null) byMonth.set(d.month, d.margin_percentage)
    }

    // Toggle on: recompute the open month's bar with over/under folded into
    // revenue. marginPerformance already carries the open month (oldestOpen
    // period), so we adjust that single bar in place — revenue + WIP against
    // the same expenses. Only when the page year is the open year.
    const om = data?.openMonthFinances ?? null
    if (
      includeOverUnder &&
      om?.openMonthPeriod != null &&
      om.openMonthYear === pageYear &&
      om.openMonthPeriod >= 1 &&
      om.openMonthPeriod <= 12
    ) {
      const row = raw.find((d) => d.month === om.openMonthPeriod)
      const ou = om.openMonthOverUnder ?? 0
      if (row && ou !== 0) {
        const rev = (row.revenue ?? 0) + ou
        const exp = row.total_expenses ?? 0
        // Divide by |rev| so the bar keeps the sign of the profit (a negative
        // revenue+WIP would otherwise flip a loss into a bogus positive bar).
        byMonth.set(om.openMonthPeriod, rev !== 0 ? ((rev - exp) / Math.abs(rev)) * 100 : 0)
      }
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
  }, [data?.marginPerformance, data?.openMonthFinances, includeOverUnder, pageYear])

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

  // Suffix the title while the toggle folds the open month's WIP into its bar
  // (same gate as the recompute above: toggle on and the page year is open).
  const wipActive = includeOverUnder && openYear != null && pageYear === openYear
  const title = wipActive ? "Monthly Margin Performance (Incl. WIP)" : "Monthly Margin Performance"

  return (
    <Widget title={title} loading={isLoading} noData={!chart}>
      {chart && (
        <Chart
          config={{
            type: "bar",
            data: chart.bars,
            yFormat: formatPercent,
            colorBy: marginColorsOn ? marginTextColor : undefined,
            scaleType: "symlog",
            scaleConstant: chart.scaleConstant,
            minValue: chart.minValue,
            maxValue: chart.maxValue,
            axisLeftTickValues: chart.ticks,
            axisBottomTickValues,
            emphasizeZero: true,
            markers,
            wipMonthLabel: wipActive && openMonth != null ? shortMonth(openMonth) : null,
          }}
        />
      )}
    </Widget>
  )
}
