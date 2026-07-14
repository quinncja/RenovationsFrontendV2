import { preloadPageData } from "../../../../shared/api/pageDataCache"
import { PAGE_QUERIES } from "../../../../shared/config/pageQueries"
import { ALL_JOBS_DETAIL_ID } from "../../../../core/auth/roles"

/**
 * Fires the destination pages' data fetches while the daily-arrival welcome
 * screen plays, so Dashboard and Job Costing mount onto warm caches. Each
 * preload must reproduce the page's own fetch exactly — same module, queries,
 * and param object key order — or the cache key won't match and the work is
 * wasted (never wrong, just wasted).
 */

// These pages persist their controls via useLocalStorage (JSON.stringify), so
// the preload must read the same keys to predict the params the page will use.
// JSON.parse can throw on legacy raw values — fall back to the hook's default.
function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function preloadEntryPages(source: "admin" | "pm", employeeId: number | null): void {
  const currentYear = new Date().getFullYear()

  // Dashboard — mirrors Dashboard.tsx's PageDataProvider props per role. A
  // non-null employeeId means a per-employee home: the all-jobs sentinel is the
  // GM's company-wide rollup (its own query set), any other value a PM's
  // supervisor id. Both are checked before the admin grid so a GM (report
  // source "admin") doesn't warm the grid it never renders.
  const dashboardYear = readStored<number>("dashboardYear", currentYear)
  if (employeeId === ALL_JOBS_DETAIL_ID) {
    preloadPageData({
      module: "dashboard",
      queries: PAGE_QUERIES.generalManagerHome,
      params: { detailId: employeeId, year: dashboardYear },
    })
  } else if (employeeId !== null) {
    preloadPageData({
      module: "dashboard",
      queries: PAGE_QUERIES.managerHome,
      params: { detailId: employeeId, year: dashboardYear },
    })
  } else if (source === "admin") {
    preloadPageData({
      module: "dashboard",
      queries: PAGE_QUERIES.adminDashboard,
      params: { year: dashboardYear },
    })
  }

  // Job Costing list — mirrors the list effect in Jobcost.tsx.
  const isManager = source === "pm"
  const jobcostYear = readStored<number | null>("jobcostYear", currentYear)
  const showAllProjects = readStored<boolean>("jobcostShowAllProjects", false)
  preloadPageData({
    module: "jobcost",
    queries: ["getPhases"],
    params: { year: jobcostYear, allProjects: isManager ? showAllProjects : null },
  })

  // Warm the lazy route chunks too (same specifiers Router.tsx lazy-loads),
  // so navigation after the welcome screen doesn't hit a Suspense fallback.
  import("../../Dashboard.tsx").catch(() => {})
  import("../../../jobcost/Jobcost.tsx").catch(() => {})
}
