import { useMemo, useState } from "react"
import { Widget } from "../../../shared/components/Widget/Widget"
import { Chart } from "../../../shared/components/Chart/Chart"
import { SegmentedControl } from "../../../shared/components/SegmentedControl"
import { useWidgetData, usePageYear } from "../../../shared/context/PageContext"
import { formatPercent, marginTextColor, shortMonth } from "../../../shared/utils/format"
import useIsMobile from "../../../shared/hooks/useIsMobile"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import useIncludeOverUnder from "../../../shared/hooks/useIncludeOverUnder"
import type { LineMarker } from "../../../shared/components/Chart/chart.types"
import { useSummaryYear } from "./summaryYearContext"

interface MarginRow {
  month: number
  // null when billed revenue for the month is non-positive (no meaningful
  // margin — the backend guards `revenue > 0`).
  margin_percentage: number | null
  // Needed to recompute the open-month bar when over/under is folded in.
  revenue?: number
  total_expenses?: number
}

interface AnnualMarginRow {
  year: number
  revenue: number
  total_expenses: number
  margin_percentage: number | null
}

interface OpenMonthPayload {
  openMonthPeriod?: number
  openMonthYear?: number
  openMonthOverUnder?: number
}

const OPEN_MARKER_COLOR = "#94a3b8" // matches the line charts' "Open" reference

// Same shared seg control (ohr dress) the home's What's Changed filter uses —
// one control family for every in-widget view toggle.
type ChartRange = "monthly" | "yearly"
const RANGE_OPTIONS = [
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
] as const

// marginPerformance returns one row per month for the selected year; plot the
// monthly margin_percentage as bars (like the old Monthly Margin Performance).
// annualMarginTrend returns one row per posting year (2018+) for the Yearly view.
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

// Symlog bounds/ticks for a set of margin bars — shared by both views so the
// monthly and yearly charts read on the same visual rules.
function symlogFromBars(bars: { label: string; value: number }[]) {
  const values = bars.map((b) => b.value)

  // Round a magnitude up to the next "nice" step so bounds/ticks read cleanly.
  const NICE = [10, 20, 30, 50, 100, 200, 300, 500, 1000]
  const niceMag = (v: number) => NICE.find((m) => m >= Math.abs(v)) ?? Math.ceil(Math.abs(v) / 1000) * 1000

  const dataMin = Math.min(0, ...values)
  const dataMax = Math.max(0, ...values)
  const minValue = dataMin < 0 ? -niceMag(dataMin) : 0
  const maxValue = dataMax > 0 ? niceMag(dataMax) : 10

  // Keep the "normal" bars (everything but the single biggest outlier) inside
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
}

export function MarginWidget() {
  const pageYear = usePageYear()
  // Bars drive the Period & Year Summary card when it shares this page: a
  // month bar pins that month (and the page's year, since the monthly chart
  // plots the page year), a year bar moves the Year column to that year.
  // Null when no summary card is on the page — the bars are then inert.
  const summary = useSummaryYear()
  const marginColorsOn = useMarginColorsEnabled()
  const [includeOverUnder] = useIncludeOverUnder()
  const [range, setRange] = useState<ChartRange>("monthly")
  const { data, isLoading } = useWidgetData<{
    marginPerformance: MarginRow[] | null
    annualMarginTrend: AnnualMarginRow[] | null
    openMonthFinances: OpenMonthPayload | null
  }>(["marginPerformance", "annualMarginTrend", "openMonthFinances"])

  const om = data?.openMonthFinances ?? null
  const openMonth = om?.openMonthPeriod ?? null
  const openYear = om?.openMonthYear ?? null

  const monthlyChart = useMemo(() => {
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
    if (
      includeOverUnder &&
      om?.openMonthPeriod != null &&
      om.openMonthYear === pageYear &&
      om.openMonthPeriod >= 1 &&
      om.openMonthPeriod <= 12
    ) {
      // A just-opened month may have no marginPerformance row yet (nothing
      // posted) while WIP already exists — fold from the over/under alone
      // rather than leaving a 0 bar under an "(Incl. WIP)" title.
      const row = raw.find((d) => d.month === om.openMonthPeriod)
      const ou = om.openMonthOverUnder ?? 0
      if (ou !== 0) {
        const rev = (row?.revenue ?? 0) + ou
        const exp = row?.total_expenses ?? 0
        // Divide by |rev| so the bar keeps the sign of the profit (a negative
        // revenue+WIP would otherwise flip a loss into a bogus positive bar).
        byMonth.set(om.openMonthPeriod, rev !== 0 ? ((rev - exp) / Math.abs(rev)) * 100 : 0)
      }
    }
    return symlogFromBars(
      MONTHS.map((m) => ({
        label: shortMonth(m),
        value: byMonth.get(m) ?? 0,
      }))
    )
  }, [data?.marginPerformance, om, includeOverUnder, pageYear])

  const yearlyChart = useMemo(() => {
    const raw = data?.annualMarginTrend
    if (!Array.isArray(raw)) return null
    const rows = raw.filter((d) => d.year > 0).sort((a, b) => a.year - b.year)
    if (rows.length === 0) return null

    return symlogFromBars(
      rows.map((d) => {
        // The trend already includes the open month's posted figures (the
        // backend caps at the open period); with the WIP toggle on, fold the
        // open month's over/under into the open year's revenue, same sign
        // rule as the monthly recompute.
        let value = d.margin_percentage ?? 0
        const ou = om?.openMonthOverUnder ?? 0
        if (includeOverUnder && openYear === d.year && ou !== 0) {
          const rev = d.revenue + ou
          value = rev !== 0 ? ((rev - d.total_expenses) / Math.abs(rev)) * 100 : 0
        }
        return { label: String(d.year), value }
      })
    )
  }, [data?.annualMarginTrend, om, includeOverUnder, openYear])

  const chart = range === "monthly" ? monthlyChart : yearlyChart

  // The bar the summary card is currently showing — lit while the rest of
  // the chart washes out, so the two read as one selection. Monthly only
  // once the user has pinned a month (an unpinned column follows the open
  // month, which the "Open" marker already flags); yearly always, since the
  // Year column is always on some year.
  const selectedBarLabel = useMemo(() => {
    if (!summary) return null
    // Yearly: only lit once the user is off the page year, so an untouched
    // chart reads normally.
    if (range === "yearly") return summary.year === pageYear ? null : String(summary.year)
    if (summary.period == null || summary.year !== pageYear) return null
    return shortMonth(summary.period)
  }, [summary, range, pageYear])

  // Bar labels are display strings ("Mar", "2024"), so map back to values.
  const onBarClick = useMemo(() => {
    if (!summary) return undefined
    if (range === "monthly") {
      return (label: string) => {
        // Clicking the lit bar again clears the pin: the chart returns to
        // full color and the Period column back to the open month.
        if (label === selectedBarLabel) {
          summary.setPeriod(null)
          return
        }
        const month = MONTHS.find((m) => shortMonth(m) === label)
        if (month) summary.selectMonth(pageYear, month)
      }
    }
    return (label: string) => {
      // Same toggle on the yearly view: re-clicking the lit year drops the
      // Year column back to the page's year.
      if (label === selectedBarLabel) {
        summary.setYear(pageYear)
        return
      }
      const year = Number(label)
      if (Number.isFinite(year)) summary.setYear(year)
    }
  }, [summary, range, pageYear, selectedBarLabel])

  // Vertical "Open" reference at the in-progress month — same visual
  // language as the four monthly line charts on the home page. Only
  // rendered when the page year matches the actually-open year (otherwise
  // the marker would float over a bar that has nothing to do with "now").
  // Monthly view only; the yearly view's open year is flagged via the
  // tooltip/WIP label instead of a marker through a single bar.
  const markers = useMemo<LineMarker[] | undefined>(() => {
    if (range !== "monthly") return undefined
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
  }, [range, openMonth, openYear, pageYear])

  // Mobile: twelve month labels crowd the x axis — show every other one.
  // Yearly keeps every label (the run of years is short).
  const isMobile = useIsMobile()
  const axisBottomTickValues = useMemo(
    () =>
      isMobile && range === "monthly" && chart
        ? chart.bars.filter((_, i) => i % 2 === 0).map((b) => b.label)
        : undefined,
    [isMobile, range, chart]
  )

  // Suffix the title while the toggle folds the open month's WIP into a bar
  // (monthly: only when the page year is open; yearly: the open year's bar
  // is always on the chart).
  const wipActive =
    includeOverUnder && openYear != null && (range === "yearly" || pageYear === openYear)
  const base = range === "monthly" ? "Monthly Gross Margin Performance" : "Annual Gross Margin Performance"
  const title = wipActive ? `${base} (Incl. WIP)` : base

  // The bar carrying folded-in WIP: the open month (monthly) / open year (yearly).
  const wipBarLabel =
    !wipActive ? null : range === "monthly" ? (openMonth != null ? shortMonth(openMonth) : null) : String(openYear)

  return (
    <Widget
      title={title}
      loading={isLoading}
      noData={!chart}
      actions={
        <SegmentedControl
          value={range}
          options={RANGE_OPTIONS}
          // Switching views drops any bar selection — the lit bar belongs to
          // the view it was clicked in, so carrying it over would leave the
          // summary card pinned to something the chart no longer shows.
          onChange={(next) => {
            setRange(next)
            if (summary) {
              summary.setPeriod(null)
              summary.setYear(pageYear)
            }
          }}
          layoutId="marginWidgetRangeSeg"
          variant="ohr"
          ariaLabel="Margin chart range"
        />
      }
    >
      {chart && (
        <Chart
          config={{
            type: "bar",
            data: chart.bars,
            yFormat: formatPercent,
            colorBy: marginColorsOn ? marginTextColor : undefined,
            barGradient: true,
            scaleType: "symlog",
            scaleConstant: chart.scaleConstant,
            minValue: chart.minValue,
            maxValue: chart.maxValue,
            axisLeftTickValues: chart.ticks,
            axisBottomTickValues,
            emphasizeZero: true,
            onBarClick,
            selectedBarLabel,
            markers,
            wipMonthLabel: wipBarLabel,
            // Same card the default per-bar tooltip renders (incl. the WIP
            // header on the open month) — supplying it as barTooltip switches
            // the chart to full-height column hover, so a low-margin sliver of
            // a bar is as easy to inspect as a tall one.
            barTooltip: (label, value) => (
              <div className="chart-tooltip">
                <span>{wipBarLabel != null && label === wipBarLabel ? `${label} Billed + WIP` : label}</span>
                <strong>{formatPercent(value)}</strong>
              </div>
            ),
          }}
        />
      )}
    </Widget>
  )
}
