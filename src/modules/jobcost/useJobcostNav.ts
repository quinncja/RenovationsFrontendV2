import { useNavigate, useLocation } from "react-router-dom"
import { propertySlug } from "./jobcostShared"

// Shared router-state contract for the Job Cost detail page's back button.
// Every entry point into /jobcost/:recnum stashes { backTo, backLabel } so the
// detail page can return the user to the page they actually came from. When the
// state is absent (cold deep-link / refresh) we fall back to the Job Costing list.
export interface JobcostBackState {
  backTo: string
  backLabel: string
}

export const JOBCOST_BACK_FALLBACK = { to: "/jobcost", label: "Job Costing" } as const

// Prefix-matched route → label map. Ordered most-specific-first so a longer
// path (e.g. /dashboard/employees) wins over a broader catch-all (/dashboard).
const BACK_LABELS: Array<[string, string]> = [
  ["/jobcost/property", "Property"],
  ["/jobcost", "Job Costing"],
  ["/reports", "Activity"],
  ["/clients", "Clients"],
  ["/vendors", "Vendors"],
  ["/subcontractors", "Subcontractors"],
  ["/employees", "Employees"],
  ["/change-orders", "Change Orders"],
  ["/invoices", "Invoices"],
  ["/progress-billings", "Progress Billings"],
  ["/dashboard/forecast-billings", "Forecast Billings"],
  ["/forecast-billings", "Forecast Billings"],
  ["/overhead-report", "Overhead"],
  ["/financial-summary", "Financial Summary"],
  ["/dashboard/breakdown", "Breakdown"],
  ["/dashboard", "Dashboard"],
]

export function deriveBackLabel(pathname: string): string {
  const match = BACK_LABELS.find(([prefix]) => pathname.startsWith(prefix))
  return match ? match[1] : JOBCOST_BACK_FALLBACK.label
}

// Wraps navigation to the Job Cost detail page, auto-capturing the current page
// as the back target. Pass `backLabel` to override the derived label for modal /
// widget contexts where the page's label isn't specific enough (e.g. "Reports").
export function useJobcostNav() {
  const navigate = useNavigate()
  const location = useLocation()

  const goToJobcost = (recnum: string | number, opts?: { backLabel?: string }) => {
    const state: JobcostBackState = {
      backTo: location.pathname + location.search,
      backLabel: opts?.backLabel ?? deriveBackLabel(location.pathname),
    }
    navigate(`/jobcost/${recnum}`, { state })
  }

  // Property detail page (/jobcost/property/:parent). The key is the Sage
  // actr_u.parent free-text address string, slugged so the URL carries dashes
  // instead of %20s; the page re-slugs candidates to match.
  const goToProperty = (parent: string, opts?: { backLabel?: string }) => {
    const state: JobcostBackState = {
      backTo: location.pathname + location.search,
      backLabel: opts?.backLabel ?? deriveBackLabel(location.pathname),
    }
    navigate(`/jobcost/property/${encodeURIComponent(propertySlug(parent))}`, { state })
  }

  return { goToJobcost, goToProperty }
}
