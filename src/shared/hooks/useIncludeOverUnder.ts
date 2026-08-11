import useLocalStorage from "./useLocalStorage"
import { useAuth } from "../../core/auth/AuthProvider"
import { effectiveRole } from "../../core/auth/roles"

// User preference: whether financial figures fold in the current open period's
// over/under — i.e. "work completed but not yet billed" (WIP). When OFF, every
// section shows the open month's *confirmed* billings only. When ON,
// `openMonthFinances.openMonthOverUnder` is added to revenue wherever the open
// month appears, and anything derived from revenue (gross profit, margin, net
// profit, cumulative totals) is recomputed.
//
// Default is role-aware: OFF for admins/executives (who toggle it from the
// pill beside the dashboard's year selector), ON for managers and General
// Managers — their per-employee breakdown figures are earned-revenue based
// (inherently WIP-inclusive), so the company-wide widgets they see (Margin,
// Period & Year Summary) should match by default. Their toggle lives in the
// Settings modal instead of a header pill. Persisted in localStorage;
// useLocalStorage dispatches a storage event on write so every widget reading
// this key re-renders in lockstep — no context/prop drilling (mirrors
// useMarginColorsEnabled).
//
// The two tiers persist under SEPARATE keys: a value the admin pill wrote
// under the shared legacy key (or any pre-role-aware `false` already sitting
// in localStorage) must never make the manager/GM home load with WIP off —
// their home has to open WIP-on unless they themselves turned it off in
// Settings.
export const INCLUDE_OVER_UNDER_KEY = "dashboardIncludeOverUnder"
export const INCLUDE_OVER_UNDER_KEY_MANAGER = "dashboardIncludeOverUnderManager"

export default function useIncludeOverUnder() {
  const { claims } = useAuth()
  const role = effectiveRole(claims["role"] as string)
  const isAdmin = role === "executive" || role === "admin"
  return useLocalStorage<boolean>(
    isAdmin ? INCLUDE_OVER_UNDER_KEY : INCLUDE_OVER_UNDER_KEY_MANAGER,
    !isAdmin
  )
}
