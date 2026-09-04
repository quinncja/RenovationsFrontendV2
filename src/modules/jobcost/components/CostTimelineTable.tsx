import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowUp, ArrowDown, ChevronRight } from "lucide-react"
import { formatMoneyFull, formatDate } from "../../../shared/utils/format"
import { useItemDrilldown } from "../../dashboard/report/ActivityFeed"
import { usePartnerNav } from "../../directory/usePartnerNav"
import type { CostItem } from "../types"
import { toDrilldownItem } from "./CostBreakdownTable"

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

// Local calendar month key (YYYY-MM) from the item's insert stamp. Same
// parse the burn-up chart uses (weeklySpend.ts): ISO date-only prefixes are
// read as local dates so nothing slips a day across the UTC boundary.
function monthKey(raw: string | undefined): string | null {
  if (!raw) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  if (m) return `${m[1]}-${m[2]}`
  const d = new Date(raw)
  if (isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-")
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`
}

interface TimelineRow {
  item: CostItem
  /** Running spend through this item, in chronological order. */
  cumulative: number
}

interface MonthGroup {
  key: string
  label: string
  rows: TimelineRow[]
  committed: number
  posted: number
  /** Running spend through the end of this month. */
  cumulative: number
}

// Chronological view of the same line items the category table groups:
// one expandable row per month (newest first by default), opening to the
// month's costs in the order they were entered, with a running total so the
// reader can see how spend accumulated. Mirrors CostBreakdownTable's
// structure and open-card treatment. Undated rows (a backend that predates
// insdte) trail in their own group.
export function CostTimelineTable({
  costItems,
  job,
  onOpenChange,
}: {
  costItems: CostItem[]
  job?: { id: string; name: string } | null
  /** Fires with whether any month is open (drives the card's pinning). */
  onOpenChange?: (open: boolean) => void
}) {
  const [newestFirst, setNewestFirst] = useState(true)
  const { openItem, modals } = useItemDrilldown({ backLabel: "Job Costing", hideProject: true })
  const { canViewPartners, goToPartner } = usePartnerNav()

  const { groups, totalCommitted, totalPosted } = useMemo(() => {
    const dated = costItems
      .map((item) => ({ item, key: monthKey(item.insdte) }))
      .sort((a, b) => {
        if (a.key == null && b.key == null) return 0
        if (a.key == null) return 1
        if (b.key == null) return -1
        return (a.item.insdte ?? "").localeCompare(b.item.insdte ?? "")
      })
    const groups: MonthGroup[] = []
    let cumulative = 0
    for (const { item, key } of dated) {
      cumulative += (item.committedAmount || 0) + (item.postedAmount || 0)
      const gk = key ?? "undated"
      let g = groups[groups.length - 1]
      if (!g || g.key !== gk) {
        g = { key: gk, label: key ? monthLabel(key) : "Undated", rows: [], committed: 0, posted: 0, cumulative: 0 }
        groups.push(g)
      }
      g.rows.push({ item, cumulative })
      g.committed += item.committedAmount || 0
      g.posted += item.postedAmount || 0
      g.cumulative = cumulative
    }
    const totalCommitted = groups.reduce((s, g) => s + g.committed, 0)
    const totalPosted = groups.reduce((s, g) => s + g.posted, 0)
    return { groups, totalCommitted, totalPosted }
  }, [costItems])

  // A single month has nothing to compare against, so it opens on its own;
  // with several, the reader picks. Re-seeded when the item set changes.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    setExpanded(groups.length === 1 ? new Set([groups[0].key]) : new Set())
  }, [groups])

  useEffect(() => { onOpenChange?.(expanded.size > 0) }, [expanded, onOpenChange])

  // One group open at a time: opening another closes the current one, so
  // the docked row under the pinned head is always the one being read.
  function toggleMonth(key: string) {
    setExpanded((prev) => (prev.has(key) ? new Set() : new Set([key])))
  }

  // Flipping the order reverses months and the rows within them; the
  // cumulative column keeps its chronological meaning either way.
  const ordered = newestFirst
    ? [...groups].reverse().map((g) => ({ ...g, rows: [...g.rows].reverse() }))
    : groups

  const DateIcon = newestFirst ? ArrowDown : ArrowUp

  if (costItems.length === 0) {
    return <div className="jc-txn-empty jc-tl-empty">No line items</div>
  }

  return (
    <>
    <table className="spend-rank-table jc-cost-breakdown jc-tl-table">
      <thead>
        <tr>
          <th className="spend-rank-table-name">
            <button
              className="co-th-btn co-th-btn-active"
              onClick={() => setNewestFirst((v) => !v)}
              title={newestFirst ? "Newest first — click for oldest first" : "Oldest first — click for newest first"}
            >
              Month <DateIcon size={11} />
            </button>
          </th>
          <th className="spend-rank-table-value"><span className="co-th-btn co-th-btn-right jc-tl-th-static">Committed</span></th>
          <th className="spend-rank-table-value"><span className="co-th-btn co-th-btn-right jc-tl-th-static">Posted</span></th>
          <th className="spend-rank-table-value"><span className="co-th-btn co-th-btn-right jc-tl-th-static">Running Total</span></th>
        </tr>
      </thead>
      {ordered.map((g) => {
        const open = expanded.has(g.key)
        return (
          <tbody key={g.key}>
            <tr
              className={`spend-rank-table-row jc-tl-month-row${open ? " jc-row-open" : ""}`}
              onClick={() => toggleMonth(g.key)}
              role="button"
              tabIndex={0}
              aria-expanded={open}
              onKeyDown={(e) => e.key === "Enter" && toggleMonth(g.key)}
            >
              <td className="spend-rank-table-name body-text emphasized">
                <span className="jc-group-label">
                  <span className="jc-group-chevron"><ChevronRight size={11} className={`jc-expand-chevron${open ? " open" : ""}`} /></span>
                  {g.label}
                  <span className="jc-tl-month-count text-secondary">{g.rows.length}</span>
                </span>
              </td>
              <td className="spend-rank-table-value body-text">{g.committed ? formatMoneyFull(g.committed) : "—"}</td>
              <td className="spend-rank-table-value body-text">{g.posted ? formatMoneyFull(g.posted) : "—"}</td>
              <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(g.cumulative)}</td>
            </tr>
            <AnimatePresence initial={false}>
              {open && (
                <tr key="txns" className="jc-txn-container-row">
                  <td colSpan={4}>
                    <motion.div
                      className="jc-txn-reveal"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <table className="jc-txn-table jc-tl-txn-table">
                        <thead>
                          <tr>
                            <th className="jc-txn-th">Date</th>
                            <th className="jc-txn-th">Category</th>
                            <th className="jc-txn-th">Vendor / Source</th>
                            <th className="jc-txn-th">Description</th>
                            <th className="jc-txn-th jc-txn-amount-col">Committed</th>
                            <th className="jc-txn-th jc-txn-amount-col">Posted</th>
                            <th className="jc-txn-th jc-txn-amount-col">Running Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.map(({ item: t, cumulative }, i) => {
                            const drillItem = toDrilldownItem(t, job)
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
                                <td className="jc-tl-date">{t.insdte ? formatDate(t.insdte) : "—"}</td>
                                <td>{t.costType}</td>
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
                                <td className="text-secondary jc-tl-desc-col">{t.dscrpt || "—"}</td>
                                <td className="jc-txn-amount-col">{t.committedAmount ? formatMoneyFull(t.committedAmount) : "—"}</td>
                                <td className="jc-txn-amount-col emphasized">{t.postedAmount ? formatMoneyFull(t.postedAmount) : "—"}</td>
                                <td className="jc-txn-amount-col text-secondary">{formatMoneyFull(cumulative)}</td>
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
          <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(totalCommitted)}</td>
          <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(totalPosted)}</td>
          <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(totalCommitted + totalPosted)}</td>
        </tr>
      </tbody>
    </table>
    {modals}
    </>
  )
}
