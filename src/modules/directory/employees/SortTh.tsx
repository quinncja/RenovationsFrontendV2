import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

// Sortable column header, same affordance as the directory pages' project
// tables (ClientsPage / VendorsPage / SubcontractorsPage): a quiet th button
// with an up/down arrow on the active column. Generic over the sort-key
// union so each table keeps its own key type. sortKey is nullable — null =
// cleared sort (the Jobcost project table's third-click-to-clear cycle).

export type SortDir = "asc" | "desc"

export function SortTh<K extends string>({ col, label, align = "left", sortKey, sortDir, onSort }: {
  col: K
  label: string
  align?: "left" | "right"
  sortKey: K | null
  sortDir: SortDir
  onSort: (k: K) => void
}) {
  const active = sortKey === col
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th style={align === "right" ? { textAlign: "right" } : undefined}>
      <button
        className={`co-th-btn${align === "right" ? " co-th-btn-right" : ""}${active ? " co-th-btn-active" : ""}`}
        onClick={() => onSort(col)}
      >
        {label} <Icon size={11} />
      </button>
    </th>
  )
}
