// Human-readable labels for engagement analytics. String-keyed (not coupled to
// the dashboard's WidgetId/SectionId unions) so this module ships independently
// of the dashboard layout; unknown ids fall back to the raw id at the call site.
export const WIDGET_LABELS: Record<string, string> = {
  reconciliation: "Reconciliation Report",
  dataQuality: "Data Quality Report",
  missingContracts: "Missing Contracts Report",
  openProjectsNoBudget: "Missing Budgets Report",
  missingUnitCounts: "Missing Unit Counts Report",
  missingOneOffNames: "Missing One-Off Names Report",
  currentYearRevenue: "Current Year Revenue",
  allTimeRevenue: "All-Time Revenue",
  annualRevenue: "Annual Revenue Trend",
  cumulativeRevenueGrowth: "Cumulative Revenue Growth",
  periodAndYearSummary: "Period & Year Summary",
  margin: "Margin",
  employeePerformance: "Employee Performance",
  monthlyRevenueComparison: "Gross Revenue by Month",
  monthlyOverhead: "Overhead Expense by Month",
  monthlyNetProfit: "Net Profit by Month",
  monthlyDirectExpense: "Total Direct Expense by Month",
  banking: "Banking & Overdue",
  billings: "Upcoming Billings",
  progressBillings: "Progress Billings",
  clientInsights: "Top Clients by Revenue",
  subcontractorInsights: "Top Subcontractors by Spend",
  vendorInsights: "Top Material Suppliers by Spend",
  estimationScorecard: "Estimation Scorecard",
  estimationCategory: "Bias by Category",
  estimationWorstJobs: "Biggest Budget Variance",
  // Daily-recap surfaces (full-screen arrival, clock modal, Reports page).
  "recap:projects": "Recap · Projects",
  "recap:committed": "Recap · Costs Committed",
  "recap:orders": "Recap · Orders Placed",
  "recap:subcontracts": "Recap · Subcontracts",
  "recap:costs": "Recap · Costs Posted",
  "recap:arReceived": "Recap · Checks Received",
  "recap:arInvoices": "Recap · AR Billed",
  "recap:apBills": "Recap · AP Received",
  recapItem: "Recap · Item Detail",
  recapCta: "Recap · Continue Button",
}

const SECTION_LABELS: Record<string, string> = {
  reports: "Reports",
  businessDevelopment: "Business Development",
  businessPerformance: "Business Performance",
  financialTrends: "P&L Trends",
  businessFinancials: "Cash & Billing",
  businessRelations: "Business Relations",
  estimationPerformance: "Budget Performance",
  recap: "Daily Recap",
}

// Route → friendly page name. Dynamic detail routes collapse to their section.
const PAGE_LABELS: Array<[string, string]> = [
  // Synthetic page for the daily recap (arrival takeover + clock modal).
  ["/daily-report", "Daily Recap"],
  ["/dashboard/breakdown", "Monthly Breakdown"],
  ["/dashboard/upcoming-billings", "Upcoming Billings"],
  ["/dashboard", "Dashboard"],
  ["/company", "Company Summary"],
  ["/jobcost", "Job Costing"],
  ["/reports", "Activity"],
  ["/change-orders", "Change Orders"],
  ["/invoices", "Invoices"],
  ["/upcoming-billings", "Upcoming Billings"],
  ["/progress-billings", "Progress Billings"],
  ["/clients", "Clients"],
  ["/vendors", "Vendors"],
  ["/subcontractors", "Subcontractors"],
  ["/employees", "Employees"],
  ["/cash-flow", "Cash Flow"],
  ["/revenue-map", "Revenue Map"],
  ["/org-chart", "Org Chart"],
  ["/users", "Users"],
  ["/feedback", "Feedback"],
]

export function widgetLabel(id: string): string {
  return (WIDGET_LABELS as Record<string, string>)[id] ?? id
}

export function sectionLabel(id: string | null): string {
  if (!id) return ""
  return (SECTION_LABELS as Record<string, string>)[id] ?? id
}

// Endpoint → friendly name for the session request list. Unknown endpoints fall
// back to the raw path, which is still meaningful to a technical reader.
const ENDPOINT_LABELS: Record<string, string> = {
  "/home-data": "Dashboard data",
  "/jobcost": "Job cost data",
  "/jobcost-data": "Job cost data",
  "/jobcost-items": "Cost items",
  "/change-orders": "Change orders",
  "/user-list": "User list",
  "/project-list": "Project list",
  "/project-list-data": "Project list data",
  "/project-phase-data": "Project phases",
  "/feedback": "Feedback",
  "/monday/process-boards": "Org chart",
}

/**
 * Human-readable breakdown of one recorded backend request. `title` names the
 * endpoint; `queries` lists the dispatch queries it batched (the `queries=`
 * param, the real payload of /home-data-style calls); `params` is the leftover
 * query params as compact `key=value` text (null when there are none).
 */
export function describeRequest(endpoint: string, query: string | null): {
  title: string
  queries: string[]
  params: string | null
} {
  const title = ENDPOINT_LABELS[endpoint] ?? endpoint
  let queries: string[] = []
  const rest: string[] = []
  if (query) {
    try {
      const sp = new URLSearchParams(query)
      for (const [key, value] of sp.entries()) {
        if (key === "queries") queries = value.split(",").filter(Boolean)
        else if (key !== "timezone") rest.push(value === "" ? key : `${key}=${value}`)
      }
    } catch {
      rest.push(query)
    }
  }
  return { title, queries, params: rest.length ? rest.join(" · ") : null }
}

export function pageLabel(path: string): string {
  const hit = PAGE_LABELS.find(([prefix]) => path === prefix || path.startsWith(prefix + "/"))
  return hit ? hit[1] : path
}

/** Compact dwell duration: "<1s", "45s", "2m 3s". */
export function formatDuration(ms: number): string {
  if (!ms || ms < 1000) return "<1s"
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return s ? `${m}m ${s}s` : `${m}m`
}

/** Compact count: 5,125 → "5.1K", 1,250,000 → "1.3M". Under 1,000 stays exact. */
export function formatCompactNumber(n: number): string {
  if (!isFinite(n)) return "0"
  const abs = Math.abs(n)
  if (abs < 1000) return n.toLocaleString()
  const units: Array<[number, string]> = [[1e6, "M"], [1e3, "K"]]
  for (const [div, suffix] of units) {
    if (abs >= div) {
      const v = n / div
      // One decimal below 100 (5.1K), whole numbers above (125K) to stay tidy.
      const s = Math.abs(v) >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, "")
      return s + suffix
    }
  }
  return n.toLocaleString()
}

/** Headline duration that rolls up into hours: "2h 14m", "14m", "45s", "0s". */
export function formatDurationLong(ms: number): string {
  if (!ms || ms < 1000) return "0s"
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const totalMin = Math.floor(totalSec / 60)
  if (totalMin < 60) return `${totalMin}m`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
