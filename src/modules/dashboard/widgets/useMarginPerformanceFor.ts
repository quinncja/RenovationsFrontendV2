import { useEffect, useState } from "react"
import { useWidgetData, usePageYear } from "../../../shared/context/PageContext"
import { fetchPageData } from "../../../shared/api/pageApi"

// One row of `marginPerformance`. The backend caps at oldestOpenPeriod.actprd
// when year === currentYear — i.e. it INCLUDES the currently-open month
// (confirmed billings only) — so summing all rows for the current year is YTD
// through the open period. Over/under (WIP) is layered on separately by widgets
// reading openMonthFinances.openMonthOverUnder when the toggle is on.
export interface MarginRow {
  month: number
  revenue: number
  total_expenses: number
  gross_profit: number
}

interface FetchState<T> {
  year: number
  rows: T[] | null
}

/**
 * Returns rows of a year-scoped dashboard query for the requested `year`.
 *
 * Free path: when `year` matches the page year, reuses the bundled query
 * already in PageDataProvider — no extra request.
 *
 * Override path: when it diverges, fires a standalone /home-data fetch for
 * that year. `loading` is derived from `override.year !== year` so the
 * effect stays free of sync setState calls (React 19 set-state-in-effect
 * rule).
 */
function useYearScopedRows<T>(queryName: string, year: number): {
  rows: T[] | null
  isLoading: boolean
} {
  const pageYear = usePageYear()
  const page = useWidgetData<Record<string, T[] | null>>([queryName])
  const usingPage = year === pageYear
  const pageRows = Array.isArray(page.data?.[queryName]) ? page.data![queryName]! : null

  const [override, setOverride] = useState<FetchState<T>>({ year: pageYear, rows: null })

  useEffect(() => {
    if (usingPage) return
    const ctrl = new AbortController()
    fetchPageData({
      module: "dashboard",
      queries: [queryName],
      params: { year },
      signal: ctrl.signal,
    })
      .then((d) => {
        const rows = Array.isArray(d[queryName]) ? (d[queryName] as T[]) : null
        setOverride({ year, rows })
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return
        setOverride({ year, rows: null })
      })
    return () => ctrl.abort()
  }, [queryName, year, usingPage])

  const rows = usingPage ? pageRows : override.year === year ? override.rows : null
  const isLoading = usingPage ? page.isLoading : override.year !== year

  return { rows, isLoading }
}

/** `marginPerformance` rows for `year` (see useYearScopedRows). */
export function useMarginPerformanceFor(year: number) {
  return useYearScopedRows<MarginRow>("marginPerformance", year)
}

// One row of `monthlyOverheadComparison`: every 6xxx GL account, per
// (month, year) for `year` AND `year - 1`, capped at the open period like
// marginPerformance — so filter by `year` before summing.
export interface OverheadRow {
  month: number
  year: number
  overhead: number
}

/** `monthlyOverheadComparison` rows for `year` (see useYearScopedRows). */
export function useMonthlyOverheadFor(year: number) {
  return useYearScopedRows<OverheadRow>("monthlyOverheadComparison", year)
}
