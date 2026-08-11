import { useMemo, useState } from "react"
import { Widget } from "../../../shared/components/Widget/Widget"
import { Chart } from "../../../shared/components/Chart/Chart"
import { MotionItem } from "../../../shared/components/MotionList/MotionList"
import { SegmentedControl } from "../../../shared/components/SegmentedControl"
import { useWidgetData } from "../../../shared/context/PageContext"
import { formatPercent, shortMonth } from "../../../shared/utils/format"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import useIncludeOverUnder from "../../../shared/hooks/useIncludeOverUnder"
import useIsMobile from "../../../shared/hooks/useIsMobile"
import { marginColor, type Breakdown } from "./breakdownRows"
import { computeSymlogBars } from "./symlogBars"
import type { LineMarker } from "../../../shared/components/Chart/chart.types"

const OPEN_MARKER_COLOR = "#94a3b8" // matches MarginWidget / home line charts

// Same shared seg control (ohr dress) the What's Changed filter uses — one
// control family for every in-widget view toggle on the home page.
type ChartRange = "monthly" | "yearly"
const RANGE_OPTIONS = [
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
] as const

/**
 * The per-employee performance pair — one Work Completed chart and one Margin
 * chart, each folding its monthly and yearly views behind a Monthly/Yearly
 * toggle — as MotionItems, so the row must be rendered inside a MotionList
 * grid. Shared between the admin /employees/:id view and the PM home's
 * Performance Over Time section so the charts can never drift apart.
 */
export function PerformanceCharts({
  monthly,
  yearly,
  year,
  isLoading,
  billing,
}: {
  monthly: Breakdown["stats"]["monthly"] | undefined
  yearly: Breakdown["stats"]["yearly"] | undefined
  year: number
  isLoading: boolean
  billing?: Breakdown["billing"]
}) {
  const marginColorsOn = useMarginColorsEnabled()
  // On mobile match the WIP toggle's label rather than spelling out "Work
  // Completed" (keeps the chart titles/legends short and consistent).
  const isMobile = useIsMobile()
  const wcLabel = isMobile ? "WIP" : "Work Completed"

  // Each chart owns its range so the pair can be compared across views
  // independently (e.g. this year's months beside the yearly margin arc).
  const [wcRange, setWcRange] = useState<ChartRange>("monthly")
  const [marginRange, setMarginRange] = useState<ChartRange>("monthly")

  // Open-month locator for the "Open" reference line on the monthly views —
  // the still-accruing month shouldn't be misread as final. openMonthFinances
  // is in both bundles that mount this (managerHome / employeeDetail).
  // Note the Work Completed chart stays on the breakdown's *earned* revenue
  // (it IS the WIP measure); only the Margin chart below switches to the
  // billing basis so the WIP toggle has a billed-only state to fall back to.
  const { data: omData } = useWidgetData<{
    openMonthFinances: { openMonthPeriod?: number; openMonthYear?: number } | null
  }>(["openMonthFinances"])
  const om = omData?.openMonthFinances ?? null
  const openLabel =
    om?.openMonthYear === year && om?.openMonthPeriod != null && om.openMonthPeriod >= 1 && om.openMonthPeriod <= 12
      ? shortMonth(om.openMonthPeriod)
      : null

  const openMarkers = useMemo<LineMarker[] | undefined>(() => {
    if (openLabel == null) return undefined
    return [
      {
        axis: "x",
        value: openLabel,
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
  }, [openLabel])

  // Line chart: Work Completed (income) by year. Mirrors AnnualRevenueWidget's
  // line series shape — one series, x = year as string, y = income.
  const workCompletedSeries = useMemo(() => {
    if (!yearly || yearly.length === 0) return null
    const sorted = [...yearly].sort((a, b) => a.year - b.year)
    return [{
      id: wcLabel,
      data: sorted.map((d) => ({ x: String(d.year), y: d.income })),
    }]
  }, [yearly, wcLabel])

  // breakdown.stats.monthly is already filtered to the selected year on the
  // backend; sort + project into the chart shapes, filling missing months with
  // 0 so the x-axis always reads Jan→Dec.
  const monthlyWorkCompletedSeries = useMemo(() => {
    if (!monthly || monthly.length === 0) return null
    const byMonth = new Map<number, number>()
    for (const d of monthly) {
      if (d.month >= 1 && d.month <= 12) byMonth.set(d.month, d.income)
    }
    return [
      {
        id: wcLabel,
        data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => ({
          x: shortMonth(m),
          y: byMonth.get(m) ?? 0,
        })),
      },
    ]
  }, [monthly, wcLabel])

  // ── Margin chart: earned margins, WIP toggle affects ONLY the open month ─
  // Every bar is the breakdown's earned/percentage-of-completion margin —
  // that's the chart, always. The closed months are settled history; the one
  // month still in motion is the open month, so that single bar is all the WIP
  // toggle swaps: ON (the manager default) keeps its earned margin (WIP in),
  // OFF replaces just that bar with its billed-only margin from the `billing`
  // block (AR invoices vs posted costs; |revenue| sign rule so a loss can't
  // read positive). If `billing` is absent (backend not deployed / no open
  // period), the toggle changes nothing. Yearly view stays earned-only.
  const [includeOverUnder] = useIncludeOverUnder()
  const openMonthBilled = !includeOverUnder && billing != null && billing.openYear === year

  const monthlyMarginBars = useMemo(() => {
    if (!monthly || monthly.length === 0) return null
    const byMonth = new Map<number, number>()
    for (const d of monthly) {
      if (d.month >= 1 && d.month <= 12) byMonth.set(d.month, d.margin)
    }
    // Cap at the oldest open period: costs future-dated past the open month
    // (and the earned revenue allocated to them) would otherwise draw margin
    // bars for months that haven't happened yet. Those months stay on the
    // axis (matching the company Margin widget) but hold no bar.
    if (om?.openMonthYear === year && om.openMonthPeriod != null) {
      for (let m = om.openMonthPeriod + 1; m <= 12; m++) byMonth.delete(m)
    }
    if (openMonthBilled) {
      const row = billing.monthly.find((d) => d.month === billing.openMonth)
      byMonth.set(
        billing.openMonth,
        row != null && row.revenue !== 0
          ? ((row.revenue - row.total_expenses) / Math.abs(row.revenue)) * 100
          : 0
      )
    }
    return computeSymlogBars(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => ({
        label: shortMonth(m),
        value: byMonth.get(m) ?? 0,
      }))
    )
  }, [monthly, openMonthBilled, billing, om, year])

  const marginBars = useMemo(() => {
    if (!yearly || yearly.length === 0) return null
    const sorted = [...yearly].sort((a, b) => a.year - b.year)
    return computeSymlogBars(sorted.map((d) => ({ label: String(d.year), value: d.margin })))
  }, [yearly])

  // Suffix while the open month's bar carries WIP (i.e. the toggle is on).
  const wipActive = includeOverUnder

  const marginBarConfig = (bars: NonNullable<typeof marginBars>, isMonthly: boolean) =>
    ({
      type: "bar",
      data: bars.bars,
      yFormat: formatPercent,
      colorBy: marginColorsOn ? marginColor : undefined,
      barGradient: true,
      scaleType: "symlog",
      scaleConstant: bars.scaleConstant,
      minValue: bars.minValue,
      maxValue: bars.maxValue,
      axisLeftTickValues: bars.ticks,
      emphasizeZero: true,
      markers: isMonthly ? openMarkers : undefined,
      // Full-height column hover (same as the admin home's margin chart) so
      // near-zero months are as hoverable as tall bars. The open month is
      // flagged: "Billed" when the toggle stripped its WIP, "(Open)" —
      // still accruing — otherwise.
      barTooltip: (label: string, value: number) => (
        <div className="chart-tooltip">
          <span>
            {isMonthly && openLabel != null && label === openLabel
              ? openMonthBilled
                ? `${label} Billed`
                : `${label} (Open)`
              : label}
          </span>
          <strong>{formatPercent(value)}</strong>
        </div>
      ),
    }) as const

  const wcSeries = wcRange === "monthly" ? monthlyWorkCompletedSeries : workCompletedSeries
  const activeMarginBars = marginRange === "monthly" ? monthlyMarginBars : marginBars

  return (
    <>
      <MotionItem>
        <Widget
          title={wcRange === "monthly" ? `${wcLabel} — ${year}` : `${wcLabel} by Year`}
          loading={isLoading}
          noData={!wcSeries}
          actions={
            <SegmentedControl
              value={wcRange}
              options={RANGE_OPTIONS}
              onChange={setWcRange}
              layoutId="wcChartRangeSeg"
              variant="ohr"
              ariaLabel="Work Completed range"
            />
          }
        >
          {wcSeries && (
            <Chart
              config={{
                type: "line",
                series: wcSeries,
                enableArea: true,
                markers: wcRange === "monthly" ? openMarkers : undefined,
              }}
            />
          )}
        </Widget>
      </MotionItem>

      <MotionItem>
        <Widget
          title={`${marginRange === "monthly" ? `Margin — ${year}` : "Margin by Year"}${wipActive ? " (Incl. WIP)" : ""}`}
          loading={isLoading}
          noData={!activeMarginBars}
          actions={
            <SegmentedControl
              value={marginRange}
              onChange={setMarginRange}
              options={RANGE_OPTIONS}
              layoutId="pmMarginChartRangeSeg"
              variant="ohr"
              ariaLabel="Margin range"
            />
          }
        >
          {activeMarginBars && (
            <Chart config={marginBarConfig(activeMarginBars, marginRange === "monthly")} />
          )}
        </Widget>
      </MotionItem>
    </>
  )
}
