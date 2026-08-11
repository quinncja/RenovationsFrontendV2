// Shared shapes + row helpers for the employee performance breakdown —
// extracted from EmployeeDetailPage so the PM/GM home sections can share them
// without importing the whole page.

// ───── Breakdown shape (page-level fetch) ────────────────────────────────
// `breakdown.projects[]` comes from the backend's `getProjectGridData`
// (same function the /jobcost page uses via `getPhases`), pre-filtered to
// this employee. That means every field the /jobcost projects table shows
// is already on each row — no second fetch + join needed.
export interface BreakdownProject {
  recnum: string | number
  name?: string
  jobnme?: string
  status: number
  totalContract?: number
  totalCost?: number
  // Raw phase rows expose the budget as `budget`; consolidated rows as
  // `totalBudget` (see project-utils.js). Accept either.
  totalBudget?: number
  budget?: number
  // Raw phase rows (consolidate:false from backend) carry pmName directly.
  pmName?: string | null
  // Consolidated rows (consolidate:true) bundle phases under here.
  phases?: { recnum: string; pmName: string | null }[]
}

export interface Breakdown {
  employee: { employeeNum: number; firstName: string; lastName: string }
  stats: {
    totals: { totalCost: number; totalIncome: number; budget: number; margin: number }
    yearly: { year: number; income: number; totalCost: number; profit: number; margin: number }[]
    monthly: { month: number; income: number; totalCost: number; profit: number; margin: number }[]
  }
  projects: BreakdownProject[]
}

// Normalized row the tables render. Mirrors the shape Jobcost.tsx builds
// from getPhases, so the columns line up exactly with /jobcost.
export interface ProjectRow {
  recnum: string
  jobNumber: string
  name: string
  status: number
  contract: number
  totalCost: number
  budget: number
  // Budget − Cost. Positive = under budget, negative = over.
  variance: number
  margin: number | null
  supervisor: string
}

export function normalizeProject(p: BreakdownProject): ProjectRow {
  const contract = p.totalContract ?? 0
  const totalCost = p.totalCost ?? 0
  const budget = p.totalBudget ?? p.budget ?? 0
  // Raw phase rows (consolidate:false) have an 8-digit recnum directly; that
  // doubles as the URL id /jobcost navigates with. Consolidated rows
  // (4-digit recnum) drill into their first phase for the 8-digit id.
  // Supervisor comes either from `pmName` on the raw row, or from any
  // phase carrying one when consolidated.
  return {
    recnum: String(p.recnum),
    jobNumber: p.phases?.[0]?.recnum ?? String(p.recnum),
    name: p.jobnme ?? p.name ?? "",
    status: p.status,
    contract,
    totalCost,
    budget,
    variance: budget - totalCost,
    margin: contract > 0 ? ((contract - totalCost) / contract) * 100 : null,
    supervisor:
      p.pmName?.trim() ??
      p.phases?.find((ph) => ph.pmName?.trim())?.pmName?.trim() ??
      "",
  }
}

export const STATUS_LABELS: Record<number, string> = {
  1: "Bidding", 2: "Refused", 3: "Contract", 4: "Current", 5: "Complete", 6: "Closed",
}

// Bar color for margin bars, mirroring MarginWidget's thresholds.
export function marginColor(margin: number): string {
  if (margin >= 20) return "#22c55e"
  if (margin >= 17) return "#f59e0b"
  return "#ef4444"
}

// Margin below which an open project lands on the watchlist. The backend's
// getWatchList uses 17%; this page surfaces the stricter 15% the team asked for.
export const WATCHLIST_MARGIN_THRESHOLD = 15
