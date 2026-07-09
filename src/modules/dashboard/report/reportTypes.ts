// Contract for the backend's dailyReport* / activityReport* queries
// (buildActivityReport in RenovationsBackend @dashboard/services). A report is
// the six-metric summary plus the activity feed for one window; PM-scoped
// reports omit the billing metrics (arInvoices / arReceived), matching the
// includeBilling split the old recentChanges queries used.

import type { RecentChangeItem } from "../widgets/recent/recentTypes"

export type ReportMetricKey =
  | "projects"
  | "committed"
  // PM-scoped reports split "committed" into its two halves, each amber like the
  // parent — orders (POs) and subcontracts. Both read summary.committed.pos/subs.
  | "orders"
  | "subcontracts"
  | "costs"
  | "apBills"
  | "arInvoices"
  | "arReceived"

export interface MetricValue {
  count: number
  amount: number
}

export interface ReportSummary {
  projects: MetricValue
  /** POs + subcontracts combined; the split is kept for the tile meta line. */
  committed: MetricValue & { pos: MetricValue; subs: MetricValue }
  costs: MetricValue
  apBills: MetricValue
  arInvoices?: MetricValue
  arReceived?: MetricValue
}

export interface ReportWindow {
  /** Naive Chicago wall-clock bounds, half-open [start, end). */
  start: string
  end: string
  /** True when the window spans more than one calendar day (Monday's daily
   *  report reaches back to Friday and picks up the weekend). */
  includesWeekend: boolean
}

export interface ReportPayload {
  window: ReportWindow
  summary: ReportSummary
  /** Feed items, newest first — same rows the Recent Changes cards showed.
   *  Capped per kind server-side (generously), unlike the uncapped summary. */
  items: RecentChangeItem[]
}
