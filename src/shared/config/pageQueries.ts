export const PAGE_QUERIES = {
  // Dashboard — admin/executive
  adminDashboard: [
    "annualRevenueTrend",
    "cumulativeRevenueGrowth",
    "monthlyRevenueComparison",
    "monthlyDirectExpenseComparison",
    "monthlyOverheadComparison",
    "monthlyNetProfitComparison",
    "marginPerformance",
    "annualDirectExpenses",
    "phaseCompletion",
    "clientInsights",
    "projectInsights",
    "subcontractorInsights",
    "vendorInsights",
    "employeePerformance",
    "agingSummary",
    "agingSummaryOpen",
    "loc",
    "dataValidation",
    "dataValidationOpen",
    "openMonthFinances",
    "overHeadExpenses",
    "projectsMissingContracts",
    "currentPeriodProjects",
    "progressBillings",
    "estimationPerformance",
    "estimationPerformancePrevYear",
    "recentChangesAdmin",
  ],

  // Dashboard "View" breakdown pages — each pulls its corresponding
  // monthly chart query plus the line-item drill-down for the table.
  dashboardBreakdownRevenue: ["monthlyRevenueComparison", "openMonthFinances", "revenueLineItems"],
  dashboardBreakdownDirectExpense: ["monthlyDirectExpenseComparison", "openMonthFinances", "directExpenseLineItems"],
  dashboardBreakdownOverhead: ["monthlyOverheadComparison", "openMonthFinances", "overheadLineItems"],

  // Upcoming Billings breakdown — the per-invoice open AR/AP rows behind the chart.
  dashboardUpcomingBillings: ["agingSummaryOpen"],

  // Progress Billings full list — every ranked project, over- and under-billed.
  dashboardProgressBillings: ["progressBillings"],

  // Employee performance detail page. `openMonthFinances` is included so the
  // Period summary half can detect which month is the actually-open one
  // (period dropdown's "Open" sentinel) — the per-employee numbers come
  // from the breakdown's monthly[] rows, not from openMonthFinances itself.
  employeeDetail: ["employeePerformanceBreakdown", "openMonthFinances"],

  // A manager's home (/dashboard) — the employee-detail view plus their
  // Recent Changes feed. recentChangesPm is scoped server-side from the
  // token's employeeId claim, so the admin /employees/:id page (which uses
  // `employeeDetail` above) never fetches it.
  managerHome: ["employeePerformanceBreakdown", "openMonthFinances", "recentChangesPm"],

  // Dashboard drill-down queries
  open: {
    phaseCompletion: ["phaseCompletionOpen"],
    dataValidation: ["dataValidation", "dataValidationOpen"],
    agingSummary: ["loc", "agingSummary", "agingSummaryOpen"],
    clientInsights: ["clientInsights", "clientInsightsPrevYear"],
    projectInsights: ["projectInsights", "projectInsightsPrevYear"],
    subcontractorInsights: ["subcontractorInsights", "subcontractorInsightsPrevYear"],
    vendorInsights: ["vendorInsights", "vendorInsightsPrevYear"],
    employeePerformance: ["employeePerformanceBreakdown"],
  },

  // Business Summary — Period & Year Summary, Margin (MoM), Employee Performance.
  businessSummary: [
    "marginPerformance",
    "openMonthFinances",
    "employeePerformance",
  ],

  // Job Costing
  projectJobcost: ["getPhases", "getBudgetByRecnum", "getAllCostItems", "getChangeOrdersByRecnum"],

  // Projects
  projects: ["homeProjectList"],

  // Cash Flow
  cashflow: ["cashflow"],

  // Org Chart (Monday.com)
  orgChart: ["orgChart"],

  // Revenue Map
  revenueMap: ["revenueMap"],

  // Invoices
  invoices: ["allInvoices"],

  // Directory — Employees (uses the same query that powers the home page
  // Employee Performance widget; this page shows the full list rather
  // than just the top N).
  employees: ["employeePerformance"],

  // Directory — Clients
  clients: ["allClientsByRevenue"],
  clientDetail: [
    "clientSummary",
    "clientRevenueByYear",
    "clientRecentInvoices",
    "clientJobs",
  ],

  // Directory — Vendors
  vendors: ["allVendorsBySpend"],
  vendorDetail: [
    "vendorSummary",
    "vendorSpendByYear",
    "vendorRecentInvoices",
    "vendorJobs",
  ],

  // Directory — Subcontractors
  subcontractors: ["allSubcontractorsBySpend"],
  subcontractorDetail: [
    "subcontractorSummary",
    "subcontractorSpendByYear",
    "subcontractorRecentInvoices",
    "subcontractorJobs",
  ],
} as const

export type PageQueryKey = keyof typeof PAGE_QUERIES
