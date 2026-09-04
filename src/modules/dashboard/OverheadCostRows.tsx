import { motion, AnimatePresence } from "framer-motion"
import { ChevronRight } from "lucide-react"
import { SkelText } from "../../shared/components/SkelText"
import { collapseValue } from "../../shared/components/MonthlyDetailTable/MonthlyDetailTable"
import { shortMonth, formatMoneyFull, formatDate } from "../../shared/utils/format"
import type { LedgerRef } from "./LedgerTransactionModal"
import { Highlight } from "./PeriodSearch"

export type LineItem = Record<string, unknown>
/** Line items for one period: the rows, or a fetch in flight / failed. */
export type PeriodItems = LineItem[] | "loading" | "error"

export interface CostRow {
  key: number
  label: string
  total: number
  /** Null when not known yet (a year whose lines haven't been fetched). */
  count: number | null
  items: PeriodItems | null
}

/**
 * Overhead costs grouped by period as expanding cards (the job-costing
 * project card, trimmed): head = period, item count, total; body = the
 * itemized ledger lines, each of which opens its ledger transaction.
 * Shared by the Overhead Report's Monthly Spending widget and the category
 * detail modal.
 */
export function OverheadCostRows({
  rows,
  openKey,
  openKeys,
  onToggle,
  onOpen,
  showCount = true,
  showMonth = false,
  showCategory = false,
  emptyText = "No costs recorded.",
  highlight,
  listRef,
}: {
  rows: CostRow[]
  /** The single open period (one at a time). */
  openKey: number | null
  /** When given, every listed period is open at once (search results); `openKey` is ignored. */
  openKeys?: ReadonlySet<number>
  onToggle: (key: number) => void
  onOpen: (ref: LedgerRef) => void
  showCount?: boolean
  showMonth?: boolean
  showCategory?: boolean
  emptyText?: string
  /** Search text to mark inside descriptions, transaction numbers and categories. */
  highlight?: string
  listRef?: React.Ref<HTMLDivElement>
}) {
  return (
    <div ref={listRef} className="ohr-detail-list scrollbar-secondary">
      {rows.length === 0 && <p className="reports-modal-empty body-text text-secondary">{emptyText}</p>}
      {rows.map((row) => {
        const isOpen = openKeys ? openKeys.has(row.key) : openKey === row.key
        return (
          <div key={row.key} data-row-key={row.key} className={`ohr-cost-card${isOpen ? " ohr-cost-card-open" : ""}`}>
            <div
              className="ohr-cost-head"
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => onToggle(row.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onToggle(row.key)
                }
              }}
            >
              <span className="jc-head-toggle">
                <ChevronRight size={15} className={`jc-expand-chevron${isOpen ? " open" : ""}`} />
              </span>
              <span className="ohr-cost-label">{row.label}</span>
              <span className="ohr-cost-stats">
                {showCount && (
                  <span className="jc-head-stat">
                    <span className="jc-head-stat-label">Items</span>
                    <span className="jc-head-stat-value">{row.count ?? "—"}</span>
                  </span>
                )}
                <span className="jc-head-stat">
                  <span className="jc-head-stat-label">Total</span>
                  <span className="jc-head-stat-value">{formatMoneyFull(row.total)}</span>
                </span>
              </span>
            </div>
            {openKeys ? (
              // Search mode: many months open at once and re-rendered on every
              // keystroke, so no height tween or row stagger here.
              isOpen && (
                <div className="ohr-cost-body">
                  <CostItems items={row.items ?? "loading"} showMonth={showMonth} showCategory={showCategory} highlight={highlight} animate={false} onOpen={onOpen} />
                </div>
              )
            ) : (
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="body"
                    className="ohr-cost-body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ height: { duration: 0.2, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.14 } }}
                  >
                    <CostItems items={row.items ?? "loading"} showMonth={showMonth} showCategory={showCategory} highlight={highlight} onOpen={onOpen} />
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** The itemized ledger lines inside an open period row, newest first. */
export function CostItems({
  items,
  showMonth,
  showCategory = false,
  highlight,
  animate = true,
  onOpen,
}: {
  items: PeriodItems
  showMonth: boolean
  showCategory?: boolean
  highlight?: string
  /** Staggered fade-in per row; off in search mode where many tables mount at once. */
  animate?: boolean
  onOpen: (ref: LedgerRef) => void
}) {
  const mark = (text: string) => <Highlight text={text} query={highlight} />
  if (items === "loading") {
    return (
      <div className="ohr-cost-items ohr-cost-items-loading" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="ohr-cost-skel-row">
            <SkelText ch={9} />
            <SkelText ch={26} />
            <SkelText ch={8} />
          </div>
        ))}
      </div>
    )
  }
  if (items === "error") {
    return <p className="reports-modal-empty body-text text-secondary">Couldn't load these costs. Try again in a moment.</p>
  }
  if (items.length === 0) {
    return <p className="reports-modal-empty body-text text-secondary">No costs this period.</p>
  }
  const sorted = [...items].sort(
    (a, b) =>
      (new Date(String(collapseValue(b.trndte) ?? "")).getTime() || 0) -
      (new Date(String(collapseValue(a.trndte) ?? "")).getTime() || 0),
  )
  const total = items.reduce((s, li) => s + Number(collapseValue(li.net) ?? 0), 0)
  const extraCols = (showMonth ? 1 : 0) + (showCategory ? 1 : 0)
  return (
    <div className="ohr-cost-items">
      <table className="data-table ohr-cost-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Trans #</th>
            <th>Description</th>
            {showCategory && <th>Category</th>}
            {showMonth && <th>Month</th>}
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((li, i) => {
            const month = Number(collapseValue(li.month))
            const Row = animate ? motion.tr : "tr"
            return (
              <Row
                key={i}
                className="ohr-cost-line"
                title="View transaction"
                onClick={() => {
                  const recnum = String(collapseValue(li.recnum) ?? "")
                  if (recnum) onOpen({ recnum, amount: Number(collapseValue(li.net) ?? 0) })
                }}
                {...(animate
                  ? { initial: { opacity: 0 }, animate: { opacity: 1, transition: { delay: Math.min(i, 8) * 0.012 + 0.04, duration: 0.14 } } }
                  : {})}
              >
                <td className="text-secondary">{formatDate(collapseValue(li.trndte))}</td>
                <td>{mark(String(collapseValue(li.trnnum) ?? "—"))}</td>
                <td>{mark(String(collapseValue(li.dscrpt) ?? "") || "—")}</td>
                {showCategory && <td>{mark(String(collapseValue(li.category) ?? "") || "—")}</td>}
                {showMonth && <td>{month >= 1 && month <= 12 ? shortMonth(month) : "Adj."}</td>}
                <td className="num">{formatMoneyFull(Number(collapseValue(li.net) ?? 0))}</td>
              </Row>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3 + extraCols}>Total</td>
            <td className="num">{formatMoneyFull(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
