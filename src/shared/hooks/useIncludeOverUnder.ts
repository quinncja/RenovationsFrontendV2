import useLocalStorage from "./useLocalStorage"

// User preference (admin dashboard): whether financial figures fold in the
// current open period's over/under — i.e. "work completed but not yet billed"
// (WIP). When OFF, every section shows the open month's *confirmed* billings
// only (the default). When ON, `openMonthFinances.openMonthOverUnder` is added
// to revenue wherever the open month appears, and anything derived from revenue
// (gross profit, margin, net profit, cumulative totals) is recomputed.
//
// Default OFF. Toggled from the pill beside the year selector; persisted in
// localStorage. useLocalStorage dispatches a storage event on write so every
// widget reading this key re-renders in lockstep — no context/prop drilling
// (mirrors useMarginColorsEnabled).
export const INCLUDE_OVER_UNDER_KEY = "dashboardIncludeOverUnder"

export default function useIncludeOverUnder() {
  return useLocalStorage<boolean>(INCLUDE_OVER_UNDER_KEY, false)
}
