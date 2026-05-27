export const PAGE_QUERIES = {
  // Dashboard — admin/executive
  adminDashboard: [
    "annualRevenueTrend",
    "cumulativeRevenueGrowth",
    "monthlyRevenueComparison",
    "marginPerformance",
    "annualDirectExpenses",
    "phaseCompletion",
    "clientInsights",
    "projectInsights",
    "subcontractorInsights",
    "vendorInsights",
    "employeePerformance",
    "agingSummary",
    "loc",
    "dataValidation",
    "openMonthFinances",
    "overHeadExpenses",
    "projectsMissingContracts",
    "currentPeriodProjects",
  ],

  // Dashboard — PM view
  employeeDashboard: [
    "employeePerformanceBreakdown",
    "watchlist",
    "projectsMissingContracts",
    "projectCount",
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

  // Business Summary
  businessSummary: [
    "annualDirectExpenses",
    "annualRevenueTrend",
    "marginPerformance",
    "openMonthFinances",
    "phaseCompletion",
    "employeePerformance",
    "overHeadExpenses",
    "currentPeriodProjects",
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
