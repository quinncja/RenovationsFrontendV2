export const PAGE_QUERIES = {
  adminDashboard: [
    "yearRevenue",
    "allTimeRevenue",
    "annualRevenueTrend",
    "grossRevenueByMonth",
    "grossRevenueByMonthPrevYear",
    "netRevenueByMonth",
    "netRevenueByMonthPrevYear",
    "spendingByMonth",
    "spendingByMonthPrevYear",
    "topClientsByRevenue",
    "topMaterialSuppliersBySpend",
    "topSubcontractorsBySpend",
    "totalMaterialSpend",
    "totalSubcontractorSpend",
  ],
  jobCost: [
    "jobCostList",
  ],
  jobCostDetail: [
    "jobCostSummary",
    "jobCostChangeOrders",
    "jobCostGroups",
    "jobCostTransactions",
  ],
  jobCostDetailPage: [
    "jobCostSummary",
    "jobCostGroups",
    "jobCostTransactions",
    "jobCostMonthlyCosts",
    "jobCostInvoices",
    "jobCostVendorSpend",
  ],
  users: [
    "allUsers",
  ],
  clients: [
    "allClientsByRevenue",
  ],
  clientDetail: [
    "clientSummary",
    "clientRevenueByYear",
    "clientRecentInvoices",
    "clientJobs",
  ],
  suppliers: [
    "allMaterialSuppliersBySpend",
  ],
  supplierDetail: [
    "supplierSummary",
    "supplierSpendByYear",
    "supplierRecentInvoices",
    "supplierJobs",
  ],
  subcontractors: [
    "allSubcontractorsBySpend",
  ],
  subcontractorDetail: [
    "subcontractorSummary",
    "subcontractorSpendByYear",
    "subcontractorRecentInvoices",
    "subcontractorJobs",
  ],
  invoices: [
    "allInvoices",
  ],
} as const

export type PageQueryKey = keyof typeof PAGE_QUERIES
export type QueryName<K extends PageQueryKey> = (typeof PAGE_QUERIES)[K][number]
export type AllQueryNames = (typeof PAGE_QUERIES)[PageQueryKey][number]
