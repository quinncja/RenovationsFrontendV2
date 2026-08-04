import useLocalStorage from "./useLocalStorage"

// User preference: what the Job Costing board's year + phase pair ("when")
// shows on a fresh visit — the SettingsModal three-way picker. The pair itself
// is session-scoped (see Jobcost.tsx); this only seeds it, so changing the
// preference never yanks a board that's already mounted.
// The year always starts on the CURRENT calendar year — the one exception is
// open-phase when the open period sits in the previous year (early-January
// before the December close), where it follows the period's own year.
//   open-phase    → the currently open Sage accounting period (year + phase)
//   current-month → the calendar year + month
//   all-phases    → the current calendar year, all phases
export type JobcostDefaultRange = "open-phase" | "current-month" | "all-phases"

export const JOBCOST_DEFAULT_RANGE_KEY = "jobcostDefaultRange"
export const JOBCOST_DEFAULT_RANGE_FALLBACK: JobcostDefaultRange = "open-phase"

export const JOBCOST_DEFAULT_RANGE_OPTIONS: { key: JobcostDefaultRange; label: string }[] = [
  { key: "open-phase", label: "Open Phase" },
  { key: "current-month", label: "This Month" },
  { key: "all-phases", label: "All Phases" },
]

export default function useJobcostDefaultRange() {
  return useLocalStorage<JobcostDefaultRange>(JOBCOST_DEFAULT_RANGE_KEY, JOBCOST_DEFAULT_RANGE_FALLBACK)
}
