import type { BadgeTone } from "../components/Badge"

// AR/AP invoice status code, duplicated verbatim as a label map + a
// color-class map across 6 files (Invoices, InvoiceDetailModal,
// PartnerDetailPage,
// JobcostDetailPage). One source of truth for both.

export const INVOICE_STATUS_LABEL: Record<number, string> = {
  1: "Open",
  2: "Review",
  3: "Dispute",
  4: "Paid",
  5: "Void",
}

export function invoiceStatusLabel(status: number): string {
  return INVOICE_STATUS_LABEL[status] ?? `Status ${status}`
}

const INVOICE_STATUS_TONE: Record<number, BadgeTone> = {
  1: "blue",
  2: "amber",
  3: "red",
  4: "green",
  5: "gray",
}

export function invoiceStatusTone(status: number): BadgeTone {
  return INVOICE_STATUS_TONE[status] ?? "blue"
}
