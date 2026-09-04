import { collapseValue } from "../../shared/components/MonthlyDetailTable/MonthlyDetailTable"
import { formatMoneyFull } from "../../shared/utils/format"
import type { LineItem } from "./OverheadCostRows"

/** Normalized search text: lowercase, trimmed, "$" and "," dropped so amounts match. */
export function normalizeSearch(q: string) {
  return q.trim().toLowerCase().replace(/[$,]/g, "")
}

/** The searchable text of a ledger line, built once per line: description,
 *  transaction number, category and the amount (with and without formatting). */
export function searchText(li: LineItem) {
  const net = Number(collapseValue(li.net) ?? 0)
  return [
    String(collapseValue(li.dscrpt) ?? ""),
    String(collapseValue(li.trnnum) ?? ""),
    String(collapseValue(li.category) ?? ""),
    formatMoneyFull(net).replace(/[$,]/g, ""),
    net.toFixed(2),
  ]
    .join("\n")
    .toLowerCase()
}

/** Searchable text for every line, keyed by the line object. */
export function buildSearchIndex(items: LineItem[]) {
  return new Map(items.map((li) => [li, searchText(li)] as const))
}

/** Does a ledger line match the (normalized) search text? */
export function lineMatches(hay: string | undefined, q: string) {
  return !q || (hay ?? "").includes(q)
}
