// Shape of a user's customizable dashboard layout, persisted via layoutApi.ts
// (GET/PUT /user/dashboard-layout). The backend stores this verbatim as a
// schemaless document, so the frontend owns this contract.
//
// v2: widgets are grouped into named sections. The home page renders one
// section at a time; widgets are reorderable within a section but never leave
// it. The grid inside a section is still a fixed two-column layout — each
// widget spans one column (half width) or both (full width). A half-width
// widget may carry an `offset` to push it into the right column.
//
// Section titles are NOT stored here — they live in SECTION_REGISTRY so a
// future rename ships without a migration and doesn't pollute the dirty check.

export type WidgetId =
  | "annualRevenue"
  | "cumulativeRevenueGrowth"
  | "currentYearRevenue"
  | "allTimeRevenue"
  | "monthlyRevenueComparison"
  | "monthlyDirectExpense"
  | "monthlyOverhead"
  | "monthlyNetProfit"
  | "margin"
  | "periodAndYearSummary"
  | "employeePerformance"
  | "clientInsights"
  | "subcontractorInsights"
  | "vendorInsights"
  // Split out of the old monolithic ReportsWidget:
  | "reconciliation"
  | "dataQuality"
  | "missingContracts"
  | "openProjectsNoBudget"
  // ADVIA cash in bank + line of credit, one widget (two cards).
  | "banking"
  // Overdue AR/AP + Upcoming Billings forecast, as one full-width unit (Overdue
  // 1/3, chart 2/3). Rendered as two cards but a single widget in the editor.
  | "billings"
  // Net over/under billings (WIP) headline + ranked list of the most
  // under-billed active projects.
  | "progressBillings"
  // ── Budget Estimation & Performance ────────────────────────────────────
  // Budget-vs-actual estimation accuracy on completed jobs (revised/post-CO
  // baseline). Headline accuracy/bias scorecard with year-over-year badges, the
  // category breakdown (Production = Labor+Sub, Material, MISC), and the
  // biggest-variance jobs table.
  | "estimationScorecard"
  | "estimationCategory"
  | "estimationWorstJobs"

export type SectionId =
  | "reports"
  | "businessDevelopment"
  | "businessPerformance"
  | "financialTrends"
  | "businessFinancials"
  | "businessRelations"
  | "estimationPerformance"

export interface WidgetLayoutItem {
  id: WidgetId
  colSpan: 1 | 2
  /** Columns to skip before this widget (0 = default, 1 = push to right column). Only meaningful for colSpan: 1. */
  offset?: number
}

export interface SectionLayout {
  id: SectionId
  widgets: WidgetLayoutItem[]
}

export interface DashboardLayout {
  // Schema version — bumped when a change must be force-applied to existing
  // saved layouts (see LAYOUT_VERSION / reconcileLayout migrations).
  version: number
  columns: 2
  sections: SectionLayout[]
}

// ─── Legacy v1 shape (flat widget list) ──────────────────────────────────
// Retained only so reconcileLayout can migrate previously-saved documents.
// `widgets[].id` is a plain string because v1 used widget ids that no longer
// exist in the WidgetId union (e.g. "reports").

export interface DashboardLayoutV1 {
  version: 1
  columns: 2
  widgets: Array<{ id: string; colSpan: 1 | 2; offset?: number }>
}
