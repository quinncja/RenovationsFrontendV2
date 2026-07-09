import type { RecentChangeItem, RecentKind } from "./recentTypes"

// ─── Kind presentation ──────────────────────────────────────────────────────
//
// Shared naming + row derivation for recent-change items, used by the widget's
// rows/tiles and by the ItemDetailModal it opens. AR/AP naming matches the rest
// of the dashboard (aging, overdue, cash widgets) — "Billing"/"Invoice" alone
// didn't say which side of the ledger.

export const KIND_LABEL: Record<RecentKind, { pill: string; full: string }> = {
  project: { pill: "New", full: "New project" },
  purchaseOrder: { pill: "PO", full: "Purchase order" },
  subcontract: { pill: "Sub", full: "Subcontract" },
  cost: { pill: "Cost", full: "Posted cost" },
  apInvoice: { pill: "AP", full: "AP invoice" },
  changeOrder: { pill: "CO", full: "Change order" },
  arInvoice: { pill: "AR", full: "AR invoice" },
  payment: { pill: "Payment", full: "Payment received" },
}

/** The item is the story; the project is supporting context. Primary text is
 *  the item itself (invoice description, PO description, cost posting);
 *  secondary is who it involves and which job it hit. */
export function rowParts(item: RecentChangeItem) {
  const meta = KIND_LABEL[item.kind]
  // Cost titles arrive as "Labor · 2 lines posted"; the pill already frames
  // the row, so the trailing verb goes.
  const title = item.kind === "cost" ? item.title.replace(/\sposted$/, "") : item.title
  // Older backend payloads titled payments "Payment · #" — pure noise.
  const cleanTitle = /^Payment(\s*·\s*#?)?$/.test(title)
    ? (item.party ?? "Payment received")
    : title
  // Projects lead with the job itself, so their secondary is just the client;
  // everything else leads with the item and carries the job as context.
  const secondaryParts =
    item.kind === "project"
      ? [item.party]
      : [item.party !== cleanTitle ? item.party : null, item.jobName]
  return {
    pill: meta.pill,
    primary: item.kind === "project" ? (item.jobName ?? cleanTitle) : cleanTitle,
    secondary: secondaryParts.filter(Boolean).join(" · "),
  }
}
