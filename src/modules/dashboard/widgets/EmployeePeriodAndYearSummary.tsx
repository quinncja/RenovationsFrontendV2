import { useMemo, useState } from "react"
import { RotateCcw } from "lucide-react"
import { useWidgetData, usePageYear } from "../../../shared/context/PageContext"
import { fullMonth, shortMonth, marginTextColor, formatRatioPercent } from "../../../shared/utils/format"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import useIncludeOverUnder from "../../../shared/hooks/useIncludeOverUnder"
import { useMarginPerformanceFor } from "./useMarginPerformanceFor"
import { YearSelector } from "../../../shared/components/YearSelector/YearSelector"
import { SummarySnapshotCard } from "./SummarySnapshotCard"

// Employee-scoped Period & Year Summary pair for /employees/:id. Reuses the
// shared SummarySnapshotCard shell from the dashboard's Period & Year card,
// but driven by the employee's `monthly` + `yearly` breakdown rows instead
// of the company-wide marginPerformance / openMonthFinances payloads.
// `openMonthFinances` is read for one thing only: to know which month the
// open period dropdown's "Open" sentinel should resolve to (it's a global
// concept — same open month for every employee). The actual numbers always
// come from the breakdown.
//
// GM home (`companyWide`): the all-jobs sentinel makes this card company-wide,
// so it takes the SAME data path as the admin dashboard's Period & Year
// Summary — billed revenue from marginPerformance / openMonthFinances, with
// the open period's over/under folded in when the "Incl. WIP" toggle is on.
// The breakdown's earned-revenue (percentage-of-completion) figures use a
// different accounting basis and never reconciled with the admin card.

interface MonthlyRow {
  month: number
  income: number
  totalCost: number
  profit: number
  margin: number
}

interface YearlyRow {
  year: number
  income: number
  totalCost: number
  profit: number
  margin: number
}

interface OpenMonth {
  openMonthPeriod?: number
  openMonthYear?: number
  openMonthIncome?: number
  openMonthSpent?: number
  openMonthOverUnder?: number
}

// Period is either an explicit user-picked month (1..12) or null = "follow
// the actually-open month". Matches the dashboard's CurrentPeriodSummary
// shape — dropdown shows real month names, reset chip restores follow-open.
type Period = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
type Status = "Open" | "Closed" | "Future"

const MONTHS: Array<Period> = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

function monthStatus(year: number, month: number, openYear: number | null, openMonth: number | null): Status | null {
  if (openYear == null || openMonth == null) return null
  if (year < openYear) return "Closed"
  if (year > openYear) return "Future"
  if (month < openMonth) return "Closed"
  if (month === openMonth) return "Open"
  return "Future"
}

interface Props {
  monthly: MonthlyRow[] | null | undefined
  yearly: YearlyRow[] | null | undefined
  loading?: boolean
  /** PM/GM home: the page-level year selector lives in the Year Summary
   *  card's corner (mirroring the Period card's month dropdown) instead of
   *  the page header. Omitted on the admin /employees/:id route, which keeps
   *  its header selector. */
  onYearChange?: (year: number) => void
  /** GM home: ignore `monthly`/`yearly` and derive both cards from the
   *  company-wide marginPerformance + openMonthFinances payloads (WIP toggle
   *  honored), so the figures match the admin dashboard's card. */
  companyWide?: boolean
}

export function EmployeePeriodAndYearSummary({
  monthly: monthlyProp,
  yearly: yearlyProp,
  loading: loadingProp,
  onYearChange,
  companyWide = false,
}: Props) {
  const pageYear = usePageYear()
  const marginColorsOn = useMarginColorsEnabled()
  const [includeOverUnder] = useIncludeOverUnder()
  const { data, isLoading: openLoading } = useWidgetData<{ openMonthFinances: OpenMonth | null }>([
    "openMonthFinances",
  ])
  // Only fetched/used on the company-wide path; on the page year this reuses
  // the bundled query (the GM home already loads marginPerformance).
  const { rows: marginRows, isLoading: marginLoading } = useMarginPerformanceFor(pageYear)

  const open = data?.openMonthFinances ?? null
  const openMonth = open?.openMonthPeriod ?? null
  const openYear = open?.openMonthYear ?? null

  // Per-year explicit selection. `null` = follow open. Mirrors the
  // dashboard's CurrentPeriodSummaryWidget behavior.
  const [periodByYear, setPeriodByYear] = useState<Record<number, Period | null>>({})
  const explicitPeriod: Period | null = periodByYear[pageYear] ?? null
  const setPeriod = (p: Period | null) =>
    setPeriodByYear({ ...periodByYear, [pageYear]: p })

  // Display month: explicit pick wins, otherwise the actually-open month.
  const resolvedMonth: number | null = explicitPeriod ?? openMonth

  // Company-wide rows in the breakdown's shape. Mirrors YearSummaryWidget /
  // CurrentPeriodSummaryWidget: marginPerformance already includes the open
  // month's confirmed billings; the open month itself prefers the
  // openMonthFinances payload (the only source carrying over/under), and the
  // WIP toggle adds openMonthOverUnder to income + profit (never cost) when
  // the displayed year is the open year.
  const company = useMemo(() => {
    if (!companyWide) return null
    const rows = Array.isArray(marginRows) ? marginRows : []
    const wipYear = includeOverUnder && open?.openMonthYear === pageYear
    const wip = wipYear ? open?.openMonthOverUnder ?? 0 : 0
    const toRow = (month: number, income: number, totalCost: number): MonthlyRow => ({
      month,
      income,
      totalCost,
      profit: income - totalCost,
      margin: income !== 0 ? ((income - totalCost) / Math.abs(income)) * 100 : 0,
    })
    const monthlyRows: MonthlyRow[] = rows
      .filter((r) => r.month >= 1 && r.month <= 12)
      .map((r) => {
        if (wipYear && open && r.month === open.openMonthPeriod) {
          return toRow(r.month, (open.openMonthIncome ?? 0) + wip, open.openMonthSpent ?? 0)
        }
        return toRow(r.month, r.revenue ?? 0, r.total_expenses ?? 0)
      })
    let income = 0
    let totalCost = 0
    for (const r of rows) {
      income += r.revenue ?? 0
      totalCost += r.total_expenses ?? 0
    }
    income += wip
    const yearlyRows: YearlyRow[] = [
      {
        year: pageYear,
        income,
        totalCost,
        profit: income - totalCost,
        margin: income !== 0 ? ((income - totalCost) / Math.abs(income)) * 100 : 0,
      },
    ]
    return { monthly: monthlyRows, yearly: yearlyRows }
  }, [companyWide, marginRows, open, includeOverUnder, pageYear])

  const monthly = company ? company.monthly : monthlyProp
  const yearly = company ? company.yearly : yearlyProp
  const loading = companyWide ? openLoading || marginLoading : loadingProp
  const wipApplied = companyWide && includeOverUnder && open?.openMonthYear === pageYear

  // Reset chip visible only when the user has navigated off the open month.
  const showReset =
    explicitPeriod != null && openMonth != null && explicitPeriod !== openMonth

  const periodView = useMemo(() => {
    const rows = Array.isArray(monthly) ? monthly : []
    if (resolvedMonth == null) {
      return { income: 0, cost: 0, profit: 0, margin: null as number | null }
    }
    const row = rows.find((r) => r.month === resolvedMonth)
    const income = row?.income ?? 0
    const cost = row?.totalCost ?? 0
    const profit = row?.profit ?? 0
    return {
      income,
      cost,
      profit,
      // Divide by |income| so the margin keeps the sign of the profit (a
      // negative income would otherwise flip a loss into a bogus positive
      // margin — see CurrentPeriodSummaryWidget).
      margin: income !== 0 ? profit / Math.abs(income) : null,
    }
  }, [monthly, resolvedMonth])

  const yearView = useMemo(() => {
    const rows = Array.isArray(yearly) ? yearly : []
    const row = rows.find((r) => r.year === pageYear)
    const income = row?.income ?? 0
    const cost = row?.totalCost ?? 0
    const profit = row?.profit ?? 0
    return {
      income,
      cost,
      profit,
      margin: income !== 0 ? profit / Math.abs(income) : null,
    }
  }, [yearly, pageYear])

  const status: Status | null =
    resolvedMonth != null ? monthStatus(pageYear, resolvedMonth, openYear, openMonth) : null

  const headlineLabel = resolvedMonth != null ? `${fullMonth(resolvedMonth)} ${pageYear}` : `${pageYear}`

  const currentYearNum = new Date().getFullYear()
  const yearMeta = pageYear === currentYearNum ? "Year to date" : "Full year"

  return (
    <div className="summary-snapshot-pair">
      <SummarySnapshotCard
        title={wipApplied && status === "Open" ? "Period Summary + WIP" : "Period Summary"}
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
            value: periodView.margin,
            format: formatRatioPercent,
            valueColor: marginColorsOn && periodView.margin != null ? marginTextColor(periodView.margin * 100) : undefined,
          },
          { title: "Income", value: periodView.income },
          { title: "COGS", value: periodView.cost },
          { title: "Gross Profit", value: periodView.profit },
        ]}
        loading={loading}
      />
      <SummarySnapshotCard
        title={wipApplied ? "Year Summary + WIP" : "Year Summary"}
        className="year-summary-widget"
        actions={onYearChange && <YearSelector value={pageYear} onChange={onYearChange} />}
        headlineLabel={String(pageYear)}
        headlineMeta={yearMeta}
        stats={[
          {
            title: "Margin",
            value: yearView.margin,
            format: formatRatioPercent,
            valueColor: marginColorsOn && yearView.margin != null ? marginTextColor(yearView.margin * 100) : undefined,
          },
          { title: "Income", value: yearView.income },
          { title: "COGS", value: yearView.cost },
          { title: "Gross Profit", value: yearView.profit },
        ]}
        loading={loading}
      />
    </div>
  )
}
