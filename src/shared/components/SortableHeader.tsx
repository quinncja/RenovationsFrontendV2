import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"
import type { SortDir } from "../hooks/useTableSort"

interface SortableHeaderProps<K extends string> {
  label: string
  columnKey: K
  activeKey: K | null
  dir: SortDir | null
  onSort: (key: K) => void
  align?: "left" | "right"
}

/**
 * A sortable <th> shared by every in-widget table so the sort affordance looks
 * and behaves identically everywhere. Keeps the <th> a real table cell (the
 * inline-flex lives on the inner span) so columns stay full width.
 */
export function SortableHeader<K extends string>({
  label,
  columnKey,
  activeKey,
  dir,
  onSort,
  align = "left",
}: SortableHeaderProps<K>) {
  const active = activeKey === columnKey
  const icon = !active ? (
    <ArrowUpDown size={12} />
  ) : dir === "asc" ? (
    <ArrowUp size={12} />
  ) : (
    <ArrowDown size={12} />
  )

  return (
    <th className="sortable-th" style={{ textAlign: align }} onClick={() => onSort(columnKey)}>
      <span className="sortable-header">{label} {icon}</span>
    </th>
  )
}
