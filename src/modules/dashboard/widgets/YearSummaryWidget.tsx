import { useMemo, useState } from "react"
import { RotateCcw } from "lucide-react"
import { YearSelector } from "../../../shared/components/YearSelector/YearSelector"
import { usePageYear, useWidgetData } from "../../../shared/context/PageContext"
import { marginTextColor, formatRatioPercent } from "../../../shared/utils/format"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import useIncludeOverUnder from "../../../shared/hooks/useIncludeOverUnder"
import useIsMobile from "../../../shared/hooks/useIsMobile"
import { useSummaryYear } from "./summaryYearContext"
import { useMarginPerformanceFor, useMonthlyOverheadFor, type MarginRow, type OverheadRow } from "./useMarginPerformanceFor"
import { SummaryColumn } from "./SummaryColumn"

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
    // Divide by |income| so the margin keeps the sign of the profit — a
    // negative income would otherwise flip a loss into a bogus positive
    // margin (see CurrentPeriodSummaryWidget).
    margin: income !== 0 ? grossProfit / Math.abs(income) : null,
  }
}

// monthlyOverheadComparison carries `year` and `year - 1`; sum only the
// displayed year's rows (already capped at the open period, so this is YTD
// for the current year and full-year for prior years).
function overheadFor(rows: OverheadRow[] | null, year: number) {
  let total = 0
  for (const r of rows ?? []) if (r.year === year) total += r.overhead ?? 0
  return total
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
  // On mobile match the WIP toggle's label rather than "Work Completed".
  const isMobile = useIsMobile()
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

  const { rows, isLoading: marginLoading } = useMarginPerformanceFor(year)
  const { rows: overheadRows, isLoading: overheadLoading } = useMonthlyOverheadFor(year)
  const loading = marginLoading || overheadLoading

  // marginPerformance already includes the open month's *confirmed* billings
  // (it's fetched with oldestOpenPeriod). When the toggle is on and the
  // displayed year is the open year, also fold in the open period's over/under
  // (WIP) — a revenue-side adjustment, so it lifts income & gross profit (and
  // thus margin and net) but never costs.
  const open = openData?.openMonthFinances ?? null
  const overUnderApplied = includeOverUnder && open?.openMonthYear === year
  const totals = useMemo(() => {
    const base = totalsFor(rows)
    const overhead = overheadFor(overheadRows, year)
    const wip = overUnderApplied ? open?.openMonthOverUnder ?? 0 : 0
    const income = base.income + wip
    const grossProfit = base.grossProfit + wip
    return {
      income,
      cogs: base.cogs,
      grossProfit,
      margin: income !== 0 ? grossProfit / Math.abs(income) : null,
      overhead,
      net: grossProfit - overhead,
    }
  }, [rows, overheadRows, year, overUnderApplied, open])

  const currentYearNum = new Date().getFullYear()
  // Reset chip mirrors the period half: visible when the displayed year
  // isn't the current calendar year. Click jumps back to current year.
  const showReset = year !== currentYearNum

  return (
    <SummaryColumn
      eyebrow={overUnderApplied ? "Year Summary + WIP" : "Year Summary"}
      pulseKey={String(year)}
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
      groups={[
        { kind: "input", lines: [
          {
            // Name the year on the two lines that bracket the statement, so a
            // glance at the top or the bottom says which year this is.
            label: `${year} Billed Income${includeOverUnder ? ` + ${isMobile ? "WIP" : "Work Completed"}` : ""}`,
            value: totals.income,
          },
          { label: "COGS", role: "minus", value: totals.cogs },
        ] },
        { kind: "result", lines: [
          { label: "Gross Profit", role: "result", value: totals.grossProfit },
          {
            label: "Margin",
            role: "qualifier",
            value: totals.margin,
            // Margin is a ratio; format it explicitly (a >100% margin would be
            // misread by the generic "percent" preset's magnitude heuristic).
            format: formatRatioPercent,
            // marginTextColor's thresholds are in whole-percentage units
            // (20+ green / 15+ amber / red), so multiply the ratio at the call
            // site — consistent with the formatter above.
            valueColor: marginColorsOn && totals.margin != null ? marginTextColor(totals.margin * 100) : undefined,
            skelCh: 5,
          },
          { label: "Overhead", role: "minus", value: totals.overhead },
        ] },
        { kind: "final", lines: [
          { label: `${year} Net Profit`, role: "result", value: totals.net, valueColor: !loading && totals.net < 0 ? "#ef4444" : undefined },
        ] },
      ]}
      loading={loading}
    />
  )
}
