import { useEffect, useState } from "react"
import { useWidgetData, usePageYear } from "../../../shared/context/PageContext"
import { fetchPageData } from "../../../shared/api/pageApi"

// One row of `marginPerformance`. The backend caps at mostRecentPeriod.actprd
// when year === currentYear, so summing all rows for the current year is YTD.
export interface MarginRow {
  month: number
  revenue: number
  total_expenses: number
  gross_profit: number
}

interface FetchState {
  year: number
  rows: MarginRow[] | null
}

/**
 * Returns `marginPerformance` rows for the requested `year`.
 *
 * Free path: when `year` matches the page year, reuses the bundled query
 * already in PageDataProvider — no extra request.
 *
 * Override path: when it diverges, fires a standalone /home-data fetch for
 * that year. `loading` is derived from `override.year !== year` so the
 * effect stays free of sync setState calls (React 19 set-state-in-effect
 * rule).
 */
export function useMarginPerformanceFor(year: number): {
  rows: MarginRow[] | null
  isLoading: boolean
} {
  const pageYear = usePageYear()
  const page = useWidgetData<{ marginPerformance: MarginRow[] | null }>([
    "marginPerformance",
  ])
  const usingPage = year === pageYear
  const pageRows = Array.isArray(page.data?.marginPerformance)
    ? page.data!.marginPerformance!
    : null

  const [override, setOverride] = useState<FetchState>({ year: pageYear, rows: null })

  useEffect(() => {
    if (usingPage) return
    const ctrl = new AbortController()
    fetchPageData({
      module: "dashboard",
      queries: ["marginPerformance"],
      params: { year },
      signal: ctrl.signal,
    })
      .then((d) => {
        const rows = Array.isArray(d.marginPerformance)
          ? (d.marginPerformance as MarginRow[])
          : null
        setOverride({ year, rows })
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return
        setOverride({ year, rows: null })
      })
    return () => ctrl.abort()
  }, [year, usingPage])

  const rows = usingPage ? pageRows : override.year === year ? override.rows : null
  const isLoading = usingPage ? page.isLoading : override.year !== year

  return { rows, isLoading }
}
