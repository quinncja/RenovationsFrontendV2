import { useMemo, useState } from "react"
import { RotateCcw } from "lucide-react"
import { YearSelector } from "../../../shared/components/YearSelector/YearSelector"
import { usePageYear, useWidgetData } from "../../../shared/context/PageContext"
import { marginTextColor } from "../../../shared/utils/format"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import useIncludeOverUnder from "../../../shared/hooks/useIncludeOverUnder"
import { useSummaryYear } from "./summaryYearContext"
import { useMarginPerformanceFor, type MarginRow } from "./useMarginPerformanceFor"
import { SummarySnapshotCard } from "./SummarySnapshotCard"

function totalsFor(rows: MarginRow[] | null) {
  if (!rows || rows.length === 0) {
    return { income: 0, cogs: 0, grossProfit: 0, margin: null as number | null }
  }
  let income = 0
  let cogs = 0
  let grossProfit = 0
  for (const r of rows) {
    income += r.revenue ?? 0
    cogs += r.total_expenses ?? 0
    grossProfit += r.gross_profit ?? 0
  }
  return {
    income,
    cogs,
    grossProfit,
    margin: income !== 0 ? grossProfit / income : null,
  }
}

interface OpenMonth {
  openMonthOverUnder?: number
  openMonthYear?: number
}

export function YearSummaryWidget() {
  const pageYear = usePageYear()
  const ctx = useSummaryYear()
  const marginColorsOn = useMarginColorsEnabled()
  const [includeOverUnder] = useIncludeOverUnder()
  const { data: openData } = useWidgetData<{ openMonthFinances: OpenMonth | null }>([
    "openMonthFinances",
  ])

  // Standalone mode (no SummaryYearProvider above): keep the historical
  // per-widget year override behavior — local state, snap-to-pageYear on
  // page-year change. Merged mode: defer entirely to the shared context so
  // the Period half follows our year too.
  const [localYear, setLocalYear] = useState(pageYear)
  const [lastPageYear, setLastPageYear] = useState(pageYear)
  if (!ctx && lastPageYear !== pageYear) {
    setLastPageYear(pageYear)
    setLocalYear(pageYear)
  }

  const year = ctx ? ctx.year : localYear
  const setYear = ctx ? ctx.setYear : setLocalYear

  const { rows, isLoading: loading } = useMarginPerformanceFor(year)

  // marginPerformance already includes the open month's *confirmed* billings
  // (it's fetched with oldestOpenPeriod). When the toggle is on and the
  // displayed year is the open year, also fold in the open period's over/under
  // (WIP) — a revenue-side adjustment, so it lifts income & gross profit (and
  // thus margin) but never costs.
  const open = openData?.openMonthFinances ?? null
  const overUnderApplied = includeOverUnder && open?.openMonthYear === year
  const totals = useMemo(() => {
    const base = totalsFor(rows)
    if (!overUnderApplied) return base
    const wip = open?.openMonthOverUnder ?? 0
    const income = base.income + wip
    const grossProfit = base.grossProfit + wip
    return {
      income,
      cogs: base.cogs,
      grossProfit,
      margin: income !== 0 ? grossProfit / income : null,
    }
  }, [rows, overUnderApplied, open])

  const currentYearNum = new Date().getFullYear()
  const meta = year === currentYearNum ? "Year to date" : "Full year"
  // Reset chip mirrors the period half: visible when the displayed year
  // isn't the current calendar year. Click jumps back to current year.
  const showReset = year !== currentYearNum

  return (
    <SummarySnapshotCard
      title={overUnderApplied ? "Year Summary + WIP" : "Year Summary"}
      className="year-summary-widget"
      actions={
        <>
          {showReset && (
            <button
              type="button"
              className="reset-to-default-btn"
              onClick={() => setYear(currentYearNum)}
              aria-label={`Reset to current year (${currentYearNum})`}
              title={`Reset to current year (${currentYearNum})`}
            >
              <RotateCcw size={13} />
            </button>
          )}
          <YearSelector value={year} onChange={setYear} />
        </>
      }
      headlineLabel={String(year)}
      headlineMeta={meta}
      stats={[
        {
          title: "Margin",
          value: totals.margin,
          format: "percent",
          // Margin is a ratio; marginTextColor's thresholds are in whole-%.
          valueColor: marginColorsOn && totals.margin != null ? marginTextColor(totals.margin * 100) : undefined,
        },
        { title: "Income", value: totals.income },
        { title: "COGS", value: totals.cogs },
        { title: "Gross Profit", value: totals.grossProfit },
      ]}
      loading={loading}
    />
  )
}
