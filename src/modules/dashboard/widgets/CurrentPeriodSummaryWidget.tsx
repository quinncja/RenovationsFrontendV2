import { useMemo, useState } from "react"
import { RotateCcw } from "lucide-react"
import { useWidgetData, usePageYear } from "../../../shared/context/PageContext"
import { fullMonth, shortMonth, marginTextColor, formatRatioPercent } from "../../../shared/utils/format"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import useIncludeOverUnder from "../../../shared/hooks/useIncludeOverUnder"
import useIsMobile from "../../../shared/hooks/useIsMobile"
import { useSummaryYear } from "./summaryYearContext"
import { useMarginPerformanceFor, useMonthlyOverheadFor } from "./useMarginPerformanceFor"
import { SummaryColumn } from "./SummaryColumn"

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

const MONTHS: Array<Period> = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

export function CurrentPeriodSummaryWidget() {
  const pageYear = usePageYear()
  const ctx = useSummaryYear()
  const marginColorsOn = useMarginColorsEnabled()
  const [includeOverUnder] = useIncludeOverUnder()
  // On mobile match the WIP toggle's label rather than spelling out "Work
  // Completed", which overflows the row.
  const isMobile = useIsMobile()
  // Inside the merged card, follow the shared year (the YearSummary half's
  // selector). Standalone (e.g. BusinessSummaryPage), follow page year.
  const effectiveYear = ctx?.year ?? pageYear

  // Explicit selection. `null` (or missing key) means "follow the actually-
  // open month" — the dropdown still displays that real month, but the user
  // hasn't pinned it. Inside the provider the pin is shared state, so the
  // Margin chart's month bars can drive this column too; standalone, it's
  // local per-year state with the same semantics.
  const [periodByYear, setPeriodByYear] = useState<Record<number, Period | null>>({})
  const explicitPeriod: Period | null = ctx
    ? (ctx.period as Period | null)
    : periodByYear[effectiveYear] ?? null
  const setPeriod = (p: Period | null) =>
    ctx ? ctx.setPeriod(p) : setPeriodByYear({ ...periodByYear, [effectiveYear]: p })

  // `openMonthFinances` is global (always the actually-open month/year,
  // independent of any year param) so it can stay on the page-level fetch.
  // `marginPerformance` + `monthlyOverheadComparison` route through the
  // year-scoped hooks so they refetch when the merged card's effective year
  // diverges from the page year.
  const { data, isLoading: openLoading } = useWidgetData<{
    openMonthFinances: OpenMonth | null
  }>(["openMonthFinances"])
  const { rows: marginRows, isLoading: marginLoading } = useMarginPerformanceFor(effectiveYear)
  const { rows: overheadRows, isLoading: overheadLoading } = useMonthlyOverheadFor(effectiveYear)
  const isLoading = openLoading || marginLoading || overheadLoading

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
    // Overhead for the displayed month: monthlyOverheadComparison carries
    // both `effectiveYear` and the prior year, so match on both keys. The
    // query is capped at the open period like marginPerformance, so a
    // future month simply has no row (→ 0).
    const overhead =
      resolvedMonth == null
        ? 0
        : (overheadRows ?? []).find((r) => r.year === effectiveYear && r.month === resolvedMonth)?.overhead ?? 0

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
      // Divide by |income|, not income, so the margin keeps the *sign of the
      // profit*. When billed income is negative (billings net negative, real
      // revenue still in unbilled WIP), dividing a negative profit by a
      // negative income would flip the sign and show a bogus *positive* margin
      // (e.g. +462%, falsely green). Using |income| makes a loss read as a
      // large negative margin (red) — honest, and still a real number.
      const margin = income !== 0 ? grossProfit / Math.abs(income) : null
      return { income, cogs, grossProfit, margin, overhead, net: grossProfit - overhead }
    }

    // All other cases: slice marginPerformance at resolvedMonth for the
    // effective year. If the row is missing (no posted data), values fall
    // to 0 / null.
    const rows = Array.isArray(marginRows) ? marginRows : []
    if (resolvedMonth == null) {
      return { income: 0, cogs: 0, grossProfit: 0, margin: null as number | null, overhead, net: -overhead }
    }
    const row = rows.find((r) => r.month === resolvedMonth)
    const income = row?.revenue ?? 0
    const cogs = row?.total_expenses ?? 0
    const grossProfit = row?.gross_profit ?? 0
    const margin = income !== 0 ? grossProfit / Math.abs(income) : null
    return { income, cogs, grossProfit, margin, overhead, net: grossProfit - overhead }
  }, [open, marginRows, overheadRows, resolvedMonth, effectiveYear, showingOpenMonth, includeOverUnder])

  // "August " when a month is resolved; empty while it's still loading.
  const monthLabel = resolvedMonth != null ? `${fullMonth(resolvedMonth)} ` : ""

  return (
    <SummaryColumn
      eyebrow={overUnderApplied ? "Period Summary + WIP" : "Period Summary"}
      pulseKey={`${effectiveYear}-${resolvedMonth ?? "open"}`}
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
                {shortMonth(m)} {effectiveYear}
              </option>
            ))}
          </select>
        </>
      }
      groups={[
        { kind: "input", lines: [
          {
            // Name the period on the two lines that bracket the statement, so
            // a glance at the top or the bottom says which month this is.
            label: `${monthLabel}Billed Income${includeOverUnder ? ` + ${isMobile ? "WIP" : "Work Completed"}` : ""}`,
            value: view.income,
          },
          { label: "COGS", role: "minus", value: view.cogs },
        ] },
        { kind: "result", lines: [
          { label: "Gross Profit", role: "result", value: view.grossProfit },
          {
            label: "Margin",
            role: "qualifier",
            value: view.margin,
            // Margin is a ratio; format it explicitly (a >100% margin would be
            // misread by the generic "percent" preset's magnitude heuristic).
            format: formatRatioPercent,
            // marginTextColor's thresholds are in whole-percentage units
            // (20+ green / 15+ amber / red), so multiply the ratio at the call
            // site — consistent with the formatter above.
            valueColor: marginColorsOn && view.margin != null ? marginTextColor(view.margin * 100) : undefined,
            skelCh: 5,
          },
          { label: "Overhead", role: "minus", value: view.overhead },
        ] },
        { kind: "final", lines: [
          { label: `${monthLabel}Net Profit`, role: "result", value: view.net, valueColor: !isLoading && view.net < 0 ? "#ef4444" : undefined },
        ] },
      ]}
      loading={isLoading}
    />
  )
}
