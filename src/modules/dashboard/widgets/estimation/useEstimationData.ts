import { useMemo } from "react"
import { useWidgetData, usePageYear } from "../../../../shared/context/PageContext"
import {
  type EstimationPayload,
  type EstimationJob,
} from "./estimationMetrics"

const DEFAULT_TOLERANCE = 5

export interface EstimationData {
  /** Raw payload (null while loading / disconnected / no data). */
  payload: EstimationPayload | null
  /** This year's COMPLETED jobs — the whole section is a completed-job
   *  retrospective. The "Incl. WIP" toggle deliberately has NO effect here: a
   *  mid-flight job has tiny actuals against a full budget and would read as
   *  wildly under, which is meaningless for grading estimating accuracy. */
  jobs: EstimationJob[]
  /** Last year's COMPLETED jobs (from the prevYear payload), or [] when the
   *  prior-year query hasn't loaded / returned nothing — feeds the YoY badges. */
  prevJobs: EstimationJob[]
  /** ±% on-budget tolerance band (from the payload, default 5). */
  tolerance: number
  /** Selected dashboard year. */
  year: number
  isLoading: boolean
  disconnected: boolean
}

/**
 * Shared accessor for the Estimation Performance widgets: pulls the current and
 * prior-year `estimationPerformance` payloads and exposes each year's COMPLETED
 * jobs plus the tolerance + selected year. The section is completed-only by
 * design (the WIP toggle is intentionally ignored), so every widget reads the
 * same retrospective job set.
 */
export function useEstimationData(): EstimationData {
  const year = usePageYear()
  const { data, isLoading, disconnected } = useWidgetData<{
    estimationPerformance: EstimationPayload | null
    estimationPerformancePrevYear: EstimationPayload | null
  }>(["estimationPerformance", "estimationPerformancePrevYear"])

  const payload = data?.estimationPerformance ?? null
  const prevPayload = data?.estimationPerformancePrevYear ?? null

  return useMemo(() => {
    const safe: EstimationPayload | null =
      payload && Array.isArray(payload.jobs) ? payload : null
    const tolerance = safe?.toleranceBand ?? DEFAULT_TOLERANCE
    // Completed jobs only. The backend already scopes completed jobs to the
    // selected year; the filter also drops any stray active job defensively.
    const jobs = (safe?.jobs ?? []).filter((j) => j.completed)

    const prevSafe =
      prevPayload && Array.isArray(prevPayload.jobs) ? prevPayload : null
    const prevJobs = (prevSafe?.jobs ?? []).filter((j) => j.completed)

    return {
      payload: safe,
      jobs,
      prevJobs,
      tolerance,
      year,
      isLoading,
      disconnected,
    }
  }, [payload, prevPayload, year, isLoading, disconnected])
}
