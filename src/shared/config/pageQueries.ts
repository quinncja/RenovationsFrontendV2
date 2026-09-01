export const PAGE_QUERIES = {
  // Dashboard — admin/executive
  adminDashboard: [
    "annualRevenueTrend",
    "cumulativeRevenueGrowth",
    "revenueProjection",
    "monthlyRevenueComparison",
    "monthlyDirectExpenseComparison",
    "monthlyOverheadComparison",
    "monthlyNetProfitComparison",
    "marginPerformance",
    "annualMarginTrend",
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
  ],

  // Dashboard "View" breakdown pages — each pulls its corresponding
  // monthly chart query plus the line-item drill-down for the table.
  dashboardBreakdownRevenue: ["monthlyRevenueComparison", "openMonthFinances", "revenueLineItems"],
  dashboardBreakdownDirectExpense: ["monthlyDirectExpenseComparison", "openMonthFinances", "directExpenseLineItems"],
  dashboardBreakdownOverhead: ["monthlyOverheadComparison", "openMonthFinances", "overheadLineItems"],

  // Overhead Expense Report (Finances tab) — monthly + cumulative comparisons,
  // per-category donut with drill-down (line items filtered client-side by
  // GL account), annual YoY trend, and overhead-as-%-of-revenue.
  overheadReport: [
    "monthlyOverheadComparison",
    "monthlyRevenueComparison",
    "openMonthFinances",
    "overheadLineItems",
    "overheadCategoryComparison",
    "annualOverheadTrend",
    "overheadCategoryHistory",
  ],

  // Upcoming Billings breakdown — the per-invoice open AR/AP rows behind the chart.
  dashboardUpcomingBillings: ["agingSummaryOpen", "weeklyBillingAccuracy"],

  // Progress Billings full list — every ranked project, over- and under-billed.
  dashboardProgressBillings: ["progressBillings"],

  // Employee performance detail page. `openMonthFinances` is included so the
  // Period summary half can detect which month is the actually-open one
  // (period dropdown's "Open" sentinel) — the per-employee numbers come
  // from the breakdown's monthly[] rows, not from openMonthFinances itself.
  employeeDetail: ["employeePerformanceBreakdown", "openMonthFinances"],

  // A manager's home (/dashboard) — the employee-detail view scoped to their
  // own supervisor id. Their activity feed now lives in the daily report
  // modal / the Reports page (dailyReportPm / activityReportPm, fetched
  // outside the page provider). whatsChangedPm is page 0 of the What's
  // Changed timeline (token-scoped; later pages fetched ad hoc with offset).
  managerHome: ["employeePerformanceBreakdown", "openMonthFinances", "whatsChangedPm"],

  // A General Manager's home (/dashboard) — company-wide (all-jobs) rollups: the
  // breakdown drives the stat cards + period/year summary (scoped to the
  // ALL_JOBS_DETAIL_ID sentinel), plus the shared Monthly Margin Performance and
  // Employee Performance widgets. No project table (that lives on Job Costing).
  generalManagerHome: [
    "employeePerformanceBreakdown",
    "openMonthFinances",
    "marginPerformance",
    // Yearly half of the Margin widget's Monthly/Yearly toggle.
    "annualMarginTrend",
    "employeePerformance",
    // The four data-validation report cards (same pair the admin home's
    // Reports section reads — counts + per-issue job rows).
    "dataValidation",
    "dataValidationOpen",
    // Page 0 of the What's Changed timeline, company-wide scope.
    "whatsChangedGm",
  ],

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
    // Overhead + Net rows of the Period & Year Summary lists.
    "monthlyOverheadComparison",
    "annualMarginTrend",
    "openMonthFinances",
    "employeePerformance",
    // Open Position column of the Period & Year Summary widget.
    "agingSummaryOpen",
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

  // Directory — Employees. Performance lens uses the same query that powers
  // the home page Employee Performance widget (full list, not top N) plus
  // allProjectPhases for its row expansion (the phases behind each PM's
  // numbers); Workload lens uses the current-state employeeWorkload rollup.
  // All fetched up front so the view toggle is instant.
  employees: ["employeePerformance", "employeeWorkload", "allProjectPhases"],

  // Directory — Clients
  clients: ["allClientsByRevenue"],
  clientDetail: [
    "clientSummary",
    "clientRevenueByYear",
    "clientRevenueByMonth",
    "clientRevenueShare",
    "clientMarginSummary",
    "clientPaymentBehavior",
    "clientInvoices",
  ],

  // Directory — Vendors
  vendors: ["allVendorsBySpend"],
  vendorDetail: [
    "vendorSummary",
    "vendorSpendByYear",
    "vendorSpendByMonth",
    "vendorCategoryShare",
    "vendorRelationship",
    "vendorInvoices",
    "partnerProjectContribution",
  ],

  // Directory — Subcontractors
  subcontractors: ["allSubcontractorsBySpend"],
  subcontractorDetail: [
    "subcontractorSummary",
    "subcontractorSpendByYear",
    "subcontractorSpendByMonth",
    "subcontractorCategoryShare",
    "subcontractorRelationship",
    "subcontractorInvoices",
    "partnerProjectContribution",
  ],
} as const

export type PageQueryKey = keyof typeof PAGE_QUERIES
