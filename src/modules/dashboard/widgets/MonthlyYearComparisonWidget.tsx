import { useMemo } from "react"
import { Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { Widget } from "../../../shared/components/Widget/Widget"
import { Chart } from "../../../shared/components/Chart/Chart"
import { useWidgetData, usePageYear } from "../../../shared/context/PageContext"
import { shortMonth } from "../../../shared/utils/format"
import useIncludeOverUnder from "../../../shared/hooks/useIncludeOverUnder"
import type { LineMarker } from "../../../shared/components/Chart/chart.types"

// Shared building block for the four "metric by month, current vs previous
// year" widgets on the dashboard home (Gross Revenue, Total Direct Expense,
// Overhead Expense, Net Profit). Each of those wraps this with a different
// page query + value column key + title.
//
// Backend shape: one row per (month, year) for currentYear and prevYear,
// e.g. `{ month: 1, year: 2026, revenue: 45000 }`. The component pivots
// into two line series (current first so nivo paints it on top of prev).

const CURRENT_YEAR_COLOR = "#c27c3e" // brand orange
const PREVIOUS_YEAR_COLOR = "#94a3b8" // light gray
const OPEN_MARKER_COLOR = "#94a3b8" // matches prev-year line so it reads as a neutral reference

interface MonthRow {
  month: number
  year: number
  // Value column varies by metric — accessed dynamically via `valueKey`.
  [key: string]: number
}

interface OpenMonthPayload {
  openMonthPeriod?: number
  openMonthYear?: number
  openMonthIncome?: number
  openMonthOverUnder?: number
}

interface Props {
  /** Widget header title, e.g. "Gross Revenue by Month". */
  title: string
  /** Query name keyed under page data, e.g. "monthlyRevenueComparison". */
  queryName: string
  /** Column on each row that holds the metric value, e.g. "revenue". */
  valueKey: string
  /** Current-year line color. Defaults to brand orange. */
  currentYearColor?: string
  /** Optional drill-down route. When set, renders a "View" link in the
   *  widget's actions row that navigates here on click. */
  viewHref?: string
  /** Extend the current-year line through the open accounting period by adding
   *  its income onto the prior point. Used for the cumulative-revenue chart,
   *  whose query only covers closed periods. */
  includeOpenPeriod?: boolean
  /** Whether this metric is revenue-side, so the "include over/under" toggle
   *  should fold the open period's WIP into its open-month point. Set for
   *  Gross Revenue / Net Profit / Cumulative Revenue; omit for the cost
   *  charts (Direct Expense, Overhead), which over/under never affects. */
  overUnderApplies?: boolean
  /** When true, append " (Incl. WIP)" to the widget's title while the WIP
   *  toggle is folding the open period into this chart. Opt-in (Gross Revenue
   *  / Net Profit) rather than tied to `overUnderApplies`. */
  wipTitleSuffix?: boolean
}

export function MonthlyYearComparisonWidget({
  title,
  queryName,
  valueKey,
  currentYearColor = CURRENT_YEAR_COLOR,
  viewHref,
  includeOpenPeriod,
  overUnderApplies,
  wipTitleSuffix,
}: Props) {
  const year = usePageYear()
  const lastYear = year - 1
  const [includeOverUnder] = useIncludeOverUnder()
  const { data, isLoading } = useWidgetData<{
    [key: string]: MonthRow[] | OpenMonthPayload | null
  }>([queryName, "openMonthFinances"])

  // Read the actual open period for the "you are here" marker. The widget
  // only draws the marker when the open year is one of the years we're
  // plotting — otherwise it'd be a vertical line on a chart where no
  // series ends at that month.
  const openMonth =
    (data?.openMonthFinances as OpenMonthPayload | null)?.openMonthPeriod ?? null
  const openYear =
    (data?.openMonthFinances as OpenMonthPayload | null)?.openMonthYear ?? null
  const openIncome =
    (data?.openMonthFinances as OpenMonthPayload | null)?.openMonthIncome ?? null
  const openOverUnder =
    (data?.openMonthFinances as OpenMonthPayload | null)?.openMonthOverUnder ?? 0

  const series = useMemo(() => {
    const raw = data?.[queryName] as MonthRow[] | null | undefined
    if (!Array.isArray(raw) || raw.length === 0) return null

    // Over/under (WIP) only adjusts revenue-side metrics, and only the open
    // month's point on its own year's line, when the toggle is on.
    const wip = overUnderApplies && includeOverUnder ? openOverUnder : 0

    const toSeries = (y: number, color: string) => {
      const isOpenYear = openMonth != null && openYear === y
      const yearRows = raw
        .filter((d) => d.year === y && d.month >= 1 && d.month <= 12)
        .sort((a, b) => a.month - b.month)
      const points = yearRows.map((d) => ({ x: shortMonth(d.month), y: Number(d[valueKey] ?? 0) }))

      if (includeOpenPeriod) {
        // Extend the current-year line through the open period: take the
        // running total at the month before the open one and add the open
        // month's income (+ WIP when toggled). The cumulative query only
        // returns closed periods, so the open month isn't already a row.
        if (isOpenYear && openIncome != null && !yearRows.some((d) => d.month === openMonth)) {
          const before = yearRows.filter((d) => d.month < openMonth!).pop()
          const cumulativeBefore = before ? Number(before[valueKey] ?? 0) : 0
          points.push({ x: shortMonth(openMonth!), y: cumulativeBefore + openIncome + wip })
        }
      } else if (wip !== 0 && isOpenYear) {
        // Non-cumulative revenue metrics already have a row for the open month
        // (fetched with oldestOpenPeriod); bump that single point by the WIP.
        const label = shortMonth(openMonth!)
        const i = points.findIndex((p) => p.x === label)
        if (i !== -1) points[i] = { ...points[i], y: points[i].y + wip }
      }

      return { id: `${y}`, color, data: points }
    }

    return [
      toSeries(year, currentYearColor),
      toSeries(lastYear, PREVIOUS_YEAR_COLOR),
    ]
  }, [data, queryName, valueKey, year, lastYear, currentYearColor, includeOpenPeriod, openMonth, openYear, openIncome, overUnderApplies, includeOverUnder, openOverUnder])

  // Vertical dashed reference at the open month. Only relevant when one
  // of the years we're plotting is the open year — otherwise the marker
  // floats over data that has nothing to do with "now".
  const markers = useMemo<LineMarker[] | undefined>(() => {
    if (openMonth == null || openYear == null) return undefined
    if (year !== openYear && lastYear !== openYear) return undefined
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
  }, [openMonth, openYear, year, lastYear])

  // Pulse dot at the open month's data point on the current-year line.
  // Only render when the currently-open year is the chart's current-year
  // series (otherwise the open month falls on the wrong line — or none).
  const pulsePoint = useMemo(() => {
    if (openMonth == null || openYear == null) return undefined
    if (year !== openYear) return undefined
    return {
      seriesId: String(year),
      xValue: shortMonth(openMonth),
      color: currentYearColor,
    }
  }, [openMonth, openYear, year, currentYearColor])

  const viewLink = viewHref ? (
    <Link to={viewHref} className="widget-link-btn" title={`View ${title} breakdown`}>
      View <ChevronRight size={12} />
    </Link>
  ) : undefined

  // Flag the open month's tooltip as "Billed + WIP" only when WIP is actually
  // folded into one of the plotted lines (the toggle is on and the open year
  // is one of the two years on the chart).
  const wipMonthLabel =
    overUnderApplies &&
    includeOverUnder &&
    openMonth != null &&
    (openYear === year || openYear === lastYear)
      ? shortMonth(openMonth)
      : null

  const displayTitle = wipTitleSuffix && wipMonthLabel != null ? `${title} (Incl. WIP)` : title

  return (
    <Widget title={displayTitle} loading={isLoading} noData={!series} actions={viewLink}>
      {series && (
        <Chart
          config={{ type: "line", series, legend: true, markers, pulsePoint, wipMonthLabel }}
        />
      )}
    </Widget>
  )
}
