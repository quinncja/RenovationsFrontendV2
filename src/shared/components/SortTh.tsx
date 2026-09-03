import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

// Sortable column header for spend-rank-table / data-table layouts: a quiet
// th button with an up/down arrow on the active column. Generic over the
// sort-key union so each table keeps its own key type. sortKey is nullable —
// null = cleared sort (e.g. the Jobcost project table's third-click-to-clear
// cycle).
//
// Two rendering modes, matched to how the surrounding table is built:
//  - default (spendRank unset): plain <th>, alignment via inline style. Used
//    by tables that don't need the spend-rank-table-name/value semantic class
//    (Employees, Workload, Clients/Vendors/Subcontractors, Change Orders).
//  - spendRank: applies the spend-rank-table-name/value class the
//    .spend-rank-table CSS keys its column widths/padding off of. Used by
//    Jobcost's project table and Progress Billings.

export type SortDir = "asc" | "desc"

export function SortTh<K extends string>({
  col,
  label,
  align = "left",
  sortKey,
  sortDir,
  onSort,
  spendRank,
  className,
  fill,
  colSpan,
}: {
  col: K
  label: string
  align?: "left" | "right" | "center"
  sortKey: K | null
  sortDir: SortDir
  onSort: (k: K) => void
  /** Use the spend-rank-table-name/value semantic <th> class instead of inline alignment. */
  spendRank?: boolean
  /** Extra class appended to the <th> (e.g. Jobcost's jc-name-col/jc-pm-col width hints). */
  className?: string
  /** Column absorbs the table's slack width (Progress Billings' Project column). */
  fill?: boolean
  colSpan?: number
}) {
  const active = sortKey === col
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  const alignBtnClass = align === "right" ? " co-th-btn-right" : align === "center" ? " co-th-btn-center" : ""

  const thClass = spendRank
    ? `${align === "right" ? "spend-rank-table-value" : "spend-rank-table-name"}${className ? ` ${className}` : ""}`
    : className
  const thStyle = !spendRank && align !== "left" ? { textAlign: align } : undefined

  return (
    <th
      className={thClass}
      colSpan={colSpan}
      style={fill ? { width: "100%", ...thStyle } : thStyle}
    >
      <button
        className={`co-th-btn${alignBtnClass}${active ? " co-th-btn-active" : ""}`}
        onClick={() => onSort(col)}
      >
        {label} <Icon size={11} />
      </button>
    </th>
  )
}
