import { useNavigate, useLocation } from "react-router-dom"
import { propertySlug } from "./jobcostShared"
import { PAGE_LABELS } from "../../core/auth/roles"

// Shared router-state contract for the Job Cost detail page's back button.
// Every entry point into /jobcost/:recnum stashes { backTo, backLabel } so the
// detail page can return the user to the page they actually came from. When the
// state is absent (cold deep-link / refresh) we fall back to the Job Costing list.
export interface JobcostBackState {
  backTo: string
  backLabel: string
}

export const JOBCOST_BACK_FALLBACK = { to: "/jobcost", label: "Job Costing" } as const

// Route → label resolution. Detail/sub-pages that need a more specific name
// than their parent nav item are listed here; everything else resolves through
// the nav table in roles.ts so a new page is labelled the moment it's added.
const DETAIL_LABELS: Array<[string, string]> = [
  ["/jobcost/property", "Property"],
  ["/jobcost/", "Job Costing"],
  ["/dashboard/forecast-billings", "Forecast Billings"],
  ["/dashboard/breakdown", "Breakdown"],
  ["/dashboard", "Dashboard"],
]

/** Human name for a pathname, or null when no route claims it. Matches on
 *  whole path segments so `/jobcostx` can't borrow Job Costing's label. */
export function pageLabel(pathname: string): string | null {
  const matches = (prefix: string) =>
    pathname === prefix ||
    pathname.startsWith(prefix.endsWith("/") ? prefix : prefix + "/")
  const detail = DETAIL_LABELS.find(([prefix]) => matches(prefix))
  if (detail) return detail[1]
  const page = PAGE_LABELS.find(([path]) => matches(path))
  return page ? page[1] : null
}

export function deriveBackLabel(pathname: string): string {
  return pageLabel(pathname) ?? JOBCOST_BACK_FALLBACK.label
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
