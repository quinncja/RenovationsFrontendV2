import { useState } from "react"
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronRight, ChevronDown } from "lucide-react"
import { formatMoneyFull } from "../../../shared/utils/format"
import { computeCostGroups, type BudgetBreakdown, type CostItem } from "../types"

type CostSortKey = "costGroup" | "budget" | "actual" | "variance" | "variancePct"
type SortDir = "asc" | "desc"

// Cost Breakdown table: cost-type groups that expand to their line items,
// with sortable columns. Rendered in the app's standard spend-rank-table
// style. Used on the project detail page and inline in the Job Costing
// list's expanded rows.
export function CostBreakdownTable({
  budget,
  costItems,
}: {
  budget: BudgetBreakdown | null
  costItems: CostItem[]
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  // No default sort — preserve the natural cost-type order until the user
  // explicitly sorts a column.
  const [costSortKey, setCostSortKey] = useState<CostSortKey | null>(null)
  const [costSortDir, setCostSortDir] = useState<SortDir>("asc")

  const { groups, totalBudget, totalActual, totalVariance } = computeCostGroups(budget, costItems)

  const sortedGroups = costSortKey == null ? groups : [...groups].sort((a, b) => {
    let av: number | string, bv: number | string
    switch (costSortKey) {
      case "costGroup": av = a.key; bv = b.key; break
      case "budget": av = a.budget; bv = b.budget; break
      case "actual": av = a.actual; bv = b.actual; break
      case "variance": av = a.variance; bv = b.variance; break
      case "variancePct": av = a.variancePct ?? -Infinity; bv = b.variancePct ?? -Infinity; break
    }
    if (av < bv) return costSortDir === "asc" ? -1 : 1
    if (av > bv) return costSortDir === "asc" ? 1 : -1
    return 0
  })

  function handleCostSort(key: CostSortKey) {
    if (costSortKey === key) setCostSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setCostSortKey(key)
      setCostSortDir(key === "costGroup" ? "asc" : "desc")
    }
  }

  // Sortable header in the standard spend-rank-table style (matches the
  // Job Costing / Change Orders / Directory list tables).
  function sortHead(col: CostSortKey, label: string, align: "left" | "right" = "right") {
    const active = costSortKey === col
    const Icon = active ? (costSortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
    const thClass = align === "right" ? "spend-rank-table-value" : "spend-rank-table-name"
    return (
      <th className={thClass}>
        <button
          className={`co-th-btn${align === "right" ? " co-th-btn-right" : ""}${active ? " co-th-btn-active" : ""}`}
          onClick={() => handleCostSort(col)}
        >
          {label} <Icon size={11} />
        </button>
      </th>
    )
  }

  function toggleGroup(name: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const totalVarClass = totalVariance < 0 ? "jc-variance-over" : totalVariance > 0 ? "jc-variance-under" : ""

  return (
    <table className="spend-rank-table jc-cost-breakdown">
      <thead>
        <tr>
          {sortHead("costGroup", "Category", "left")}
          {sortHead("budget", "Budget")}
          {sortHead("actual", "Actual")}
          {sortHead("variance", "Variance")}
          {sortHead("variancePct", "Variance %")}
        </tr>
      </thead>
      <tbody>
        {sortedGroups.flatMap((group) => {
          const expanded = expandedGroups.has(group.key)
          const varClass = group.variance < 0 ? "jc-variance-over" : group.variance > 0 ? "jc-variance-under" : ""
          return [
            <tr
              key={group.key}
              className="spend-rank-table-row"
              onClick={() => toggleGroup(group.key)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && toggleGroup(group.key)}
            >
              <td className="spend-rank-table-name body-text emphasized">
                <span className="jc-group-chevron">{expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}</span>
                {group.key}
              </td>
              <td className="spend-rank-table-value body-text">{formatMoneyFull(group.budget)}</td>
              <td className="spend-rank-table-value body-text">{formatMoneyFull(group.actual)}</td>
              <td className={`spend-rank-table-value body-text ${varClass}`}>{group.variance > 0 ? "+" : ""}{formatMoneyFull(group.variance)}</td>
              <td className={`spend-rank-table-value body-text ${varClass}`}>{group.variancePct == null ? "—" : `${group.variance > 0 ? "+" : ""}${group.variancePct.toFixed(1)}%`}</td>
            </tr>,
            ...(expanded ? [
              <tr key={`${group.key}-txns`} className="jc-txn-container-row">
                <td colSpan={5}>
                  <table className="jc-txn-table">
                    <thead>
                      <tr>
                        <th className="jc-txn-th">Vendor / Source</th>
                        <th className="jc-txn-th">Description</th>
                        <th className="jc-txn-th jc-txn-amount-col">Committed</th>
                        <th className="jc-txn-th jc-txn-amount-col">Posted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.length === 0 ? (
                        <tr><td colSpan={4} className="jc-txn-empty">No line items</td></tr>
                      ) : group.items.map((t, i) => (
                        <tr key={`${t.recnum}-${i}`} className="jc-txn-row">
                          <td className="jc-txn-vendor">{t.id}</td>
                          <td className="text-secondary">{t.dscrpt || "—"}</td>
                          <td className="jc-txn-amount-col">{t.committedAmount ? formatMoneyFull(t.committedAmount) : "—"}</td>
                          <td className="jc-txn-amount-col emphasized">{t.postedAmount ? formatMoneyFull(t.postedAmount) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
              </tr>,
            ] : []),
          ]
        })}
        <tr className="jc-total-row">
          <td className="spend-rank-table-name body-text emphasized">
            <span className="jc-group-chevron jc-group-chevron-spacer"><ChevronRight size={11} /></span>
            Total
          </td>
          <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(totalBudget)}</td>
          <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(totalActual)}</td>
          <td className={`spend-rank-table-value body-text emphasized ${totalVarClass}`}>{totalVariance > 0 ? "+" : ""}{formatMoneyFull(totalVariance)}</td>
          <td className={`spend-rank-table-value body-text emphasized ${totalVarClass}`}>
            {totalBudget !== 0 ? `${totalVariance > 0 ? "+" : ""}${((totalVariance / totalBudget) * 100).toFixed(1)}%` : "—"}
          </td>
        </tr>
      </tbody>
    </table>
  )
}
