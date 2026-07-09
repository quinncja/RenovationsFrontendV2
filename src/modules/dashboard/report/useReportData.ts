import { useEffect, useState } from "react"
import { fetchPageData } from "../../../shared/api/pageApi"
import type { DateRange } from "./chicagoDate"
import type { ReportPayload } from "./reportTypes"

/** Which query pair feeds the report: admins fetch company-wide with billing,
 *  managers fetch token-scoped to their jobs without it — the same split the
 *  old recentChangesAdmin/Pm queries used. */
export type ReportSource = "admin" | "pm"

const DAILY_QUERY: Record<ReportSource, string> = {
  admin: "dailyReportAdmin",
  pm: "dailyReportPm",
}
const RANGE_QUERY: Record<ReportSource, string> = {
  admin: "activityReportAdmin",
  pm: "activityReportPm",
}

// The dispatch nulls failed queries rather than erroring, so a payload that
// doesn't hold the full shape (auth rejected, SQL error) reads as null here.
function normalize(raw: unknown): ReportPayload | null {
  if (!raw || typeof raw !== "object") return null
  const p = raw as ReportPayload
  if (!p.window?.start || !p.summary || !Array.isArray(p.items)) return null
  return p
}

/**
 * One-shot fetch for the daily welcome modal. Imperative (not a hook) so the
 * gate can decide *after* the response whether to open at all — a failed fetch
 * skips the modal and leaves the once-per-day marker unstamped for a retry
 * next session.
 */
export async function fetchDailyReport(
  source: ReportSource,
  signal?: AbortSignal
): Promise<ReportPayload | null> {
  const query = DAILY_QUERY[source]
  const data = await fetchPageData({ module: "dashboard", queries: [query], signal })
  return normalize(data[query])
}

export interface RangeReportData {
  payload: ReportPayload | null
  isLoading: boolean
  disconnected: boolean
}

/**
 * Range report for the Reports page. Self-fetching (rather than a
 * PageDataProvider) because the range is page-local state that changes with
 * every preset/calendar pick.
 */
export function useRangeReport(source: ReportSource, range: DateRange): RangeReportData {
  const [state, setState] = useState<RangeReportData>({
    payload: null,
    isLoading: true,
    disconnected: false,
  })

  useEffect(() => {
    const ctrl = new AbortController()
    setState((s) => ({ ...s, isLoading: true, disconnected: false }))

    const query = RANGE_QUERY[source]
    fetchPageData({
      module: "dashboard",
      queries: [query],
      params: { from: range.from, to: range.to },
      signal: ctrl.signal,
    })
      .then((data) => {
        const payload = normalize(data[query])
        setState({ payload, isLoading: false, disconnected: payload === null })
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return
        setState({ payload: null, isLoading: false, disconnected: true })
      })
    return () => ctrl.abort()
  }, [source, range.from, range.to])

  return state
}
