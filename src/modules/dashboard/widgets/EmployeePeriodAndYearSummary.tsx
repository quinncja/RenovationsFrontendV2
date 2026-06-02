import { useMemo, useState } from "react"
import { RotateCcw } from "lucide-react"
import { useWidgetData, usePageYear } from "../../../shared/context/PageContext"
import { fullMonth, shortMonth, marginTextColor } from "../../../shared/utils/format"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import { SummarySnapshotCard } from "./SummarySnapshotCard"

// Employee-scoped Period & Year Summary pair for /employees/:id. Reuses the
// shared SummarySnapshotCard shell from the dashboard's Period & Year card,
// but driven by the employee's `monthly` + `yearly` breakdown rows instead
// of the company-wide marginPerformance / openMonthFinances payloads.
// `openMonthFinances` is read for one thing only: to know which month the
// open period dropdown's "Open" sentinel should resolve to (it's a global
// concept — same open month for every employee). The actual numbers always
// come from the breakdown.

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
}

export function EmployeePeriodAndYearSummary({ monthly, yearly, loading }: Props) {
  const pageYear = usePageYear()
  const marginColorsOn = useMarginColorsEnabled()
  const { data } = useWidgetData<{ openMonthFinances: OpenMonth | null }>(["openMonthFinances"])

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
      margin: income !== 0 ? profit / income : null,
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
      margin: income !== 0 ? profit / income : null,
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
        title="Period Summary"
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
            format: "percent",
            valueColor: marginColorsOn && periodView.margin != null ? marginTextColor(periodView.margin * 100) : undefined,
          },
          { title: "Income", value: periodView.income },
          { title: "COGS", value: periodView.cost },
          { title: "Gross Profit", value: periodView.profit },
        ]}
        loading={loading}
      />
      <SummarySnapshotCard
        title="Year Summary"
        className="year-summary-widget"
        headlineLabel={String(pageYear)}
        headlineMeta={yearMeta}
        stats={[
          {
            title: "Margin",
            value: yearView.margin,
            format: "percent",
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
