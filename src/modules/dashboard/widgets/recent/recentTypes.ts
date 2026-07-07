// Contract for the backend's recentChangesPm / recentChangesAdmin queries
// (getRecentChanges in RenovationsBackend @dashboard/queries). One flat list of
// typed items; the cards filter by `kind` client-side.

export type RecentKind =
  | "project"
  | "purchaseOrder"
  | "subcontract"
  | "cost"
  | "apInvoice"
  | "changeOrder"
  | "arInvoice"
  | "payment"

export interface RecentChangeItem {
  kind: RecentKind
  /** Source recnum (synthetic for aggregated cost rows / payments). */
  id: string
  /** Job recnum for drill-in, or null (e.g. an AR invoice with no job). */
  jobId: string | null
  jobName: string | null
  title: string
  /** Vendor or client name, per kind. */
  party: string | null
  amount: number | null
  /** changeOrder: 'entered' | 'approved'; cost: 'posted'; invoices: numeric status. */
  status: string | null
  /** Supervisor of the item's job — shown on the admin (company-wide) feed. */
  pmName: string | null
  enteredBy: string | null
  /** Record-entry timestamp (insdte/entdte; aprdte for approved COs). */
  occurredAt: string
}

export interface RecentChangesPayload {
  /** Window start, naive ISO ('YYYY-MM-DDT00:00:00', start of last business day). */
  cutoff: string
  scope: "pm" | "company"
  items: RecentChangeItem[]
}

