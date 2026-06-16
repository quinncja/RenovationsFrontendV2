import { useMemo, useState } from "react"
import { RotateCcw } from "lucide-react"
import { useWidgetData, usePageYear } from "../../../shared/context/PageContext"
import { fullMonth, shortMonth, marginTextColor } from "../../../shared/utils/format"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import useIncludeOverUnder from "../../../shared/hooks/useIncludeOverUnder"
import { useSummaryYear } from "./summaryYearContext"
import { useMarginPerformanceFor } from "./useMarginPerformanceFor"
import { SummarySnapshotCard } from "./SummarySnapshotCard"

// A period is either an explicit month (1..12) the user picked, or null
// meaning "follow the actually-open month". Dropping the prior "open"
// sentinel from the dropdown — the picker now shows real month names only,
// defaulting to whatever month is currently open. A small reset chip
// appears beside the dropdown when the user navigates off the open month.
type Period = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

interface OpenMonth {
  openMonthIncome?: number
  openMonthSpent?: number
  openMonthOverUnder?: number
  openMonthPeriod?: number
  openMonthYear?: number
}

type Status = "Open" | "Closed" | "Future"

const MONTHS: Array<Period> = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

// Position of (year, month) relative to the actually-open (openYear, openMonth).
function monthStatus(year: number, month: number, openYear: number | null, openMonth: number | null): Status | null {
  if (openYear == null || openMonth == null) return null
  if (year < openYear) return "Closed"
  if (year > openYear) return "Future"
  if (month < openMonth) return "Closed"
  if (month === openMonth) return "Open"
  return "Future"
}

export function CurrentPeriodSummaryWidget() {
  const pageYear = usePageYear()
  const ctx = useSummaryYear()
  const marginColorsOn = useMarginColorsEnabled()
  const [includeOverUnder] = useIncludeOverUnder()
  // Inside the merged card, follow the shared year (the YearSummary half's
  // selector). Standalone (e.g. BusinessSummaryPage), follow page year.
  const effectiveYear = ctx?.year ?? pageYear

  // Per-year explicit selection. `null` (or missing key) means "follow the
  // actually-open month" — the dropdown still displays that real month,
  // but the user hasn't pinned it. Switching the page year restores
  // whatever (if anything) the user picked for the new year.
  const [periodByYear, setPeriodByYear] = useState<Record<number, Period | null>>({})
  const explicitPeriod: Period | null = periodByYear[effectiveYear] ?? null
  const setPeriod = (p: Period | null) =>
    setPeriodByYear({ ...periodByYear, [effectiveYear]: p })

  // `openMonthFinances` is global (always the actually-open month/year,
  // independent of any year param) so it can stay on the page-level fetch.
  // `marginPerformance` we route through the shared hook so it refetches
  // when the merged card's effective year diverges from the page year.
  const { data, isLoading: openLoading } = useWidgetData<{
    openMonthFinances: OpenMonth | null
  }>(["openMonthFinances"])
  const { rows: marginRows, isLoading: marginLoading } = useMarginPerformanceFor(effectiveYear)
  const isLoading = openLoading || marginLoading

  const open = data?.openMonthFinances ?? null
  const openMonth = open?.openMonthPeriod ?? null
  const openYear = open?.openMonthYear ?? null

  // Resolved display month: explicit pick wins, otherwise mirror the
  // actually-open month (pinned to the effective year, so switching the
  // year moves the display to that year's same-index month rather than
  // leaking the open year's month into a different year's view).
  const resolvedMonth: number | null = explicitPeriod ?? openMonth

  // Reset chip shows when the user has explicitly picked a month other
  // than the currently-open one. Stays hidden when they re-pick the open
  // month (state goes from null → openMonth = same display, still "on the
  // open period") and while openMonth is still loading.
  const showReset =
    explicitPeriod != null && openMonth != null && explicitPeriod !== openMonth

  // True when the card is displaying the actually-open month for the open
  // year — the only case where the open period's over/under (WIP) applies.
  const showingOpenMonth =
    open != null &&
    openYear != null &&
    openMonth != null &&
    effectiveYear === openYear &&
    resolvedMonth === openMonth

  // The over/under (WIP) actually moves the displayed numbers only when the
  // toggle is on AND the open month is what's on screen.
  const overUnderApplied = includeOverUnder && showingOpenMonth

  const view = useMemo(() => {
    // For the actually-open month, prefer the `openMonthFinances` payload —
    // it's the only source of in-progress data (income/spent and the WIP
    // over/under). `marginPerformance` does include the open month (it's
    // fetched with oldestOpenPeriod), but openMonthFinances is the canonical
    // source for the open-period card and the only one carrying over/under.
    if (showingOpenMonth) {
      const wip = includeOverUnder ? open!.openMonthOverUnder ?? 0 : 0
      const income = (open!.openMonthIncome ?? 0) + wip
      const cogs = open!.openMonthSpent ?? 0
      const grossProfit = income - cogs
      const margin = income !== 0 ? grossProfit / income : null
      return { income, cogs, grossProfit, margin }
    }

    // All other cases: slice marginPerformance at resolvedMonth for the
    // effective year. If the row is missing (no posted data), values fall
    // to 0 / null.
    const rows = Array.isArray(marginRows) ? marginRows : []
    if (resolvedMonth == null) {
      return { income: 0, cogs: 0, grossProfit: 0, margin: null as number | null }
    }
    const row = rows.find((r) => r.month === resolvedMonth)
    const income = row?.revenue ?? 0
    const cogs = row?.total_expenses ?? 0
    const grossProfit = row?.gross_profit ?? 0
    const margin = income !== 0 ? grossProfit / income : null
    return { income, cogs, grossProfit, margin }
  }, [open, marginRows, resolvedMonth, showingOpenMonth, includeOverUnder])

  const status: Status | null =
    resolvedMonth != null ? monthStatus(effectiveYear, resolvedMonth, openYear, openMonth) : null

  const headlineLabel = resolvedMonth != null ? `${fullMonth(resolvedMonth)} ${effectiveYear}` : `${effectiveYear}`

  return (
    <SummarySnapshotCard
      title={overUnderApplied ? "Period Summary — including current over / under" : "Period Summary"}
      className="period-summary-widget"
      actions={
        <>
          {showReset && (
            <button
              type="button"
              className="reset-to-default-btn"
              onClick={() => setPeriod(null)}
              aria-label={`Reset to open period${openMonth ? ` (${fullMonth(openMonth)})` : ""}`}
              title={`Reset to open period${openMonth ? ` (${fullMonth(openMonth)})` : ""}`}
            >
              <RotateCcw size={13} />
            </button>
          )}
          <select
            className="year-selector period-select"
            value={resolvedMonth != null ? String(resolvedMonth) : ""}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (n >= 1 && n <= 12) setPeriod(n as Period)
            }}
            aria-label="Select period"
          >
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {shortMonth(m)}
              </option>
            ))}
          </select>
        </>
      }
      headlineLabel={headlineLabel}
      headlineStatus={
        status ? { tone: status.toLowerCase() as "open" | "closed" | "future", label: status } : null
      }
      stats={[
        {
          title: "Margin",
          value: view.margin,
          format: "percent",
          // Margin is stored as a ratio (0..1); marginTextColor's thresholds
          // are in whole-percentage units (20+ green / 15+ amber / red).
          // Multiply at the call site rather than changing the helper.
          valueColor: marginColorsOn && view.margin != null ? marginTextColor(view.margin * 100) : undefined,
        },
        { title: "Income", value: view.income },
        { title: "COGS", value: view.cogs },
        { title: "Gross Profit", value: view.grossProfit },
      ]}
      loading={isLoading}
    />
  )
}
