import type { ChangeOrderLineItem } from "../types"

// Shared arithmetic for change orders — the list page, detail modal, and the
// new-order wizard all read the same three figures off a change order shape.
interface CoTotals {
  material?: number
  labor?: number
  subs?: number
  wtpm?: number
  total?: number
  lineItems?: ChangeOrderLineItem[]
}

/** Cost (a.k.a. budget) = the line-item subtotal before markup. */
export function coCost(co: CoTotals): number {
  return (co.material ?? 0) + (co.labor ?? 0) + (co.subs ?? 0) + (co.wtpm ?? 0)
}

/** Markup = total − cost. */
export function coMarkup(co: CoTotals): number {
  return (co.total ?? 0) - coCost(co)
}

/** Markup as a percentage of cost, one decimal, "0.0" when cost is zero. */
export function coMarkupPct(co: CoTotals): string {
  const cost = coCost(co)
  return cost > 0 ? ((coMarkup(co) / cost) * 100).toFixed(1) : "0.0"
}

/** Unique, non-empty unit #s across a change order's line items. */
export function coUnits(co: CoTotals): string[] {
  return Array.from(
    new Set((co.lineItems ?? []).map((li) => String(li.unit ?? "").trim()).filter(Boolean)),
  )
}

/** The units as CSV for table cells, or the app's empty dash when none. */
export function unitsCsv(co: CoTotals): string {
  const units = coUnits(co)
  return units.length ? units.join(", ") : "—"
}
