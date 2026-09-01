import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronRight } from "lucide-react"
import { formatMoneyFull } from "../../../shared/utils/format"
import { useItemDrilldown } from "../../dashboard/report/ActivityFeed"
import type { RecentChangeItem } from "../../dashboard/widgets/recent/recentTypes"
import { computeCostGroups, COST_TYPES, type BudgetBreakdown, type CostItem } from "../types"
import { usePartnerNav } from "../../directory/usePartnerNav"

// Full-height loading stand-in for CostBreakdownTable. The table's shape is
// fully known before the fetch returns — always the four COST_TYPES rows
// plus Total — so this renders the real header, real category labels, and
// shimmer bars where the numbers will land, at identical geometry. The
// expanded row's open animation therefore travels to the FINAL height
// immediately instead of landing short and jumping when data arrives.
export function CostBreakdownSkeleton() {
  const numCells = [0, 1, 2, 3]
  return (
    <table className="spend-rank-table jc-cost-breakdown" aria-hidden="true" style={{ pointerEvents: "none" }}>
      <thead>
        <tr>
          {(["Category", "Budget", "Actual", "Variance", "Variance %"] as const).map((label, i) => (
            <th key={label} className={i === 0 ? "spend-rank-table-name" : "spend-rank-table-value"}>
              <span className={`co-th-btn${i === 0 ? "" : " co-th-btn-right"}`}>
                {label} <ArrowUpDown size={11} />
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {COST_TYPES.map((key) => (
          <tr key={key} className="spend-rank-table-row">
            <td className="spend-rank-table-name body-text emphasized">
              <span className="jc-group-label">
                <span className="jc-group-chevron"><ChevronRight size={11} /></span>
                {key}
              </span>
            </td>
            {numCells.map((i) => (
              <td key={i} className="spend-rank-table-value body-text">
                <span className="skel-line jc-skel-num" />
              </td>
            ))}
          </tr>
        ))}
        <tr className="jc-total-row">
          <td className="spend-rank-table-name body-text emphasized">
            <span className="jc-group-chevron jc-group-chevron-spacer"><ChevronRight size={11} /></span>
            Total
          </td>
          {numCells.map((i) => (
            <td key={i} className="spend-rank-table-value body-text emphasized">
              <span className="skel-line jc-skel-num" />
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}

type CostSortKey = "costGroup" | "budget" | "actual" | "variance" | "variancePct"
type SortDir = "asc" | "desc"

// Maps a line item to the recap-style drill-down it opens (same modals as the
// Daily Recap feed): PO rows → purchase-order modal, subcontract rows →
// subcontract modal, invoice-backed posted costs → the AP invoice modal.
// Rows with no document behind them (payroll/journal postings, or a backend
// that predates itemType/linkRecnum) still open a header-only "Posted cost"
// card with the posting's own details. Their jobId stays null on purpose:
// the modal's cost ledger describes a job × cost-type rollup, not this
// single posting, so a null jobId skips that fetch.
function toDrilldownItem(t: CostItem, job: { id: string; name: string } | null | undefined): RecentChangeItem {
  const kind =
    !t.linkRecnum ? null :
    t.itemType === "po" ? "purchaseOrder" :
    t.itemType === "sub" ? "subcontract" :
    t.itemType === "cost" ? "apInvoice" :
    null
  return {
    kind: kind ?? "cost",
    id: kind == null ? `cost-${t.recnum}` : String(t.linkRecnum),
    jobId: kind == null ? null : job?.id ?? null,
    jobName: job?.name ?? null,
    title: t.dscrpt?.trim() || t.id,
    party: t.id,
    partyId: t.vendorId ?? null,
    amount: (t.committedAmount || 0) + (t.postedAmount || 0),
    status: null,
    pmName: null,
    enteredBy: t.insusr ?? null,
    occurredAt: t.insdte ?? "",
  }
}

// Cost Breakdown table: cost-type groups that expand to their line items,
// with sortable columns. Rendered in the app's standard spend-rank-table
// style. Used on the project detail page and inline in the Job Costing
// list's expanded rows.
export function CostBreakdownTable({
  budget,
  costItems,
  job,
}: {
  budget: BudgetBreakdown | null
  costItems: CostItem[]
  /** Job context for the drill-down modals' "View project" link. Omit on the
   *  project detail page — you're already there, so the link is dropped. */
  job?: { id: string; name: string } | null
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  // No default sort — preserve the natural cost-type order until the user
  // explicitly sorts a column.
  const [costSortKey, setCostSortKey] = useState<CostSortKey | null>(null)
  const [costSortDir, setCostSortDir] = useState<SortDir>("asc")
  // Same drill-down wiring as the Daily Recap feed: invoice-shaped items open
  // the invoice modal, POs/subcontracts the generic detail modal.
  const { openItem, modals } = useItemDrilldown({ backLabel: "Job Costing" })
  const { canViewPartners, goToPartner } = usePartnerNav()

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

  // Three-state cycle matching useTableSort: first click sorts (text asc,
  // numbers desc), second flips, third restores the natural cost-type order.
  function handleCostSort(key: CostSortKey) {
    const firstDir: SortDir = key === "costGroup" ? "asc" : "desc"
    if (costSortKey !== key) {
      setCostSortKey(key)
      setCostSortDir(firstDir)
    } else if (costSortDir === firstDir) {
      setCostSortDir(firstDir === "asc" ? "desc" : "asc")
    } else {
      setCostSortKey(null)
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
    <>
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
      {sortedGroups.map((group) => {
        const expanded = expandedGroups.has(group.key)
        const varClass = group.variance < 0 ? "jc-variance-over" : group.variance > 0 ? "jc-variance-under" : ""
        return (
          <tbody key={group.key}>
            <tr
              className={`spend-rank-table-row${expanded ? " jc-row-open" : ""}`}
              onClick={() => toggleGroup(group.key)}
              role="button"
              tabIndex={0}
              aria-expanded={expanded}
              onKeyDown={(e) => e.key === "Enter" && toggleGroup(group.key)}
            >
              <td className="spend-rank-table-name body-text emphasized">
                {/* Flex keeps the label beside the chevron even when a longer
                    name (e.g. Subcontractor) wraps on narrow screens. */}
                <span className="jc-group-label">
                  <span className="jc-group-chevron"><ChevronRight size={11} className={`jc-expand-chevron${expanded ? " open" : ""}`} /></span>
                  {group.key}
                </span>
              </td>
              <td className="spend-rank-table-value body-text">{formatMoneyFull(group.budget)}</td>
              <td className="spend-rank-table-value body-text">{formatMoneyFull(group.actual)}</td>
              <td className={`spend-rank-table-value body-text ${varClass}`}>{group.variance > 0 ? "+" : ""}{formatMoneyFull(group.variance)}</td>
              <td className={`spend-rank-table-value body-text ${varClass}`}>{group.variancePct == null ? "—" : `${group.variance > 0 ? "+" : ""}${group.variancePct.toFixed(1)}%`}</td>
            </tr>
            {/* Same open treatment as the Job Costing project table: the row
                and its line items lift out as one rounded, softly-shadowed
                card, the panel revealing with the same height animation. A
                <tr> can't animate height, so the motion div lives inside the
                cell; the tr stays mounted through AnimatePresence until the
                exit finishes, keeping the ink frame around the shrinking
                panel. */}
            <AnimatePresence initial={false}>
              {expanded && (
                <tr key="txns" className="jc-txn-container-row">
                  <td colSpan={5}>
                    <motion.div
                      className="jc-txn-reveal"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
                    >
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
                          ) : group.items.map((t, i) => {
                            const drillItem = toDrilldownItem(t, job)
                            // The row opens the item's detail modal; the vendor
                            // cell alone jumps to the partner's directory page
                            // (exec/admin only — other roles can't reach it).
                            const partnerKind = t.costType === "Subcontractor" ? "subcontractor" as const : "vendor" as const
                            const vendorLinked = canViewPartners && t.vendorId != null
                            return (
                              <tr
                                key={`${t.recnum}-${i}`}
                                className="jc-txn-row jc-txn-row-link"
                                onClick={() => openItem(drillItem)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => e.key === "Enter" && openItem(drillItem)}
                              >
                                <td className="jc-txn-vendor">
                                  {vendorLinked ? (
                                    <button
                                      type="button"
                                      className="jc-vendor-link"
                                      onClick={(e) => { e.stopPropagation(); goToPartner(partnerKind, t.vendorId!) }}
                                      onKeyDown={(e) => e.stopPropagation()}
                                    >
                                      {t.id}
                                    </button>
                                  ) : t.id}
                                </td>
                                <td className="text-secondary">{t.dscrpt || "—"}</td>
                                <td className="jc-txn-amount-col">{t.committedAmount ? formatMoneyFull(t.committedAmount) : "—"}</td>
                                <td className="jc-txn-amount-col emphasized">{t.postedAmount ? formatMoneyFull(t.postedAmount) : "—"}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </motion.div>
                  </td>
                </tr>
              )}
            </AnimatePresence>
          </tbody>
        )
      })}
      <tbody>
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
    {/* Drill-down modals render through portals, so they sit outside the
        table markup regardless of where this fragment lands. */}
    {modals}
    </>
  )
}
