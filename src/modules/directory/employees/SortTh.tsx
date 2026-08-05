import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"

// Sortable <th> in the co-widget voice (co-th-btn), shared by the Employees
// page's Performance and Workload tables so both read identically. Generic
// over the table's own sort-key union.

export type SortDir = "asc" | "desc"

export function SortTh<K extends string>({ col, label, align = "left", sortKey, sortDir, onSort }: {
  col: K
  label: string
  align?: "left" | "right"
  sortKey: K
  sortDir: SortDir
  onSort: (k: K) => void
}) {
  const active = sortKey === col
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  const thClass = align === "right" ? "spend-rank-table-value" : "spend-rank-table-name"
  return (
    <th className={thClass}>
      <button
        className={`co-th-btn${align === "right" ? " co-th-btn-right" : ""}${active ? " co-th-btn-active" : ""}`}
        onClick={() => onSort(col)}
      >
        {label} <Icon size={11} />
      </button>
    </th>
  )
}
