import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { useWidgetData } from "../../../../shared/context/PageContext"
import { StatPairCard } from "../StatPairCard"
import { SortableHeader } from "../../../../shared/components/SortableHeader"
import { useTableSort, applySort } from "../../../../shared/hooks/useTableSort"
import { fetchPageData } from "../../../../shared/api/pageApi"
import { formatMoneyFull, formatDate } from "../../../../shared/utils/format"
import { AR_COLOR, AP_COLOR } from "../billings/billingsShared"

// Cash in bank + line of credit, rendered as two stacked stat boxes inside one
// container — structurally identical to the Overdue card beside it, so the two
// read as clean sibling cards. The `agingSummary` query returns a CASH row
// (bank balance) and a CreditSpent row (line-of-credit drawn); the `loc` query
// gives the credit limit. Both already ship in PAGE_QUERIES.adminDashboard.
//
// The Cash in Bank stat is clickable (mirroring Overdue AR/AP): it opens a modal
// listing the underlying bank transactions for the last 45 days. Those rows are
// NOT in the dashboard payload — they're fetched lazily when the modal opens.
interface AgingSummaryRow {
  type: string
  amount: number
}
interface LocPayload {
  loc?: number
}

interface BankTransactionRow {
  recnum: string | number
  date: string
  description: string | null
  /** Signed net cash movement: positive = money in (AR), negative = out (AP). */
  amount: number
  /** "AR" = debit to cash (collection/deposit), "AP" = credit (payment out). */
  type: "AR" | "AP"
  vendorNum: string | number | null
  vendorName: string | null
  status: number | null
}

function rowAmount(rows: AgingSummaryRow[] | null | undefined, type: string): number | null {
  if (!Array.isArray(rows)) return null
  const row = rows.find((r) => r.type === type)
  return row ? row.amount : null
}

type TxnSortKey = "date" | "type" | "description" | "amount"

/**
 * Modal listing the ADVIA cash/bank transactions for the last 45 days. Lazily
 * fetches `bankTransactions` on open. Structurally mirrors OverdueModal, minus
 * the row drill-down (bank transactions aren't invoices).
 */
function BankTransactionsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sort = useTableSort<TxnSortKey>("date", "desc")
  const [rows, setRows] = useState<BankTransactionRow[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const controller = new AbortController()
    setIsLoading(true)
    fetchPageData({ module: "dashboard", queries: ["bankTransactions"], signal: controller.signal })
      .then((res) => {
        if (cancelled) return
        const data = res.bankTransactions
        setRows(Array.isArray(data) ? (data as BankTransactionRow[]) : [])
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [open])

  const sorted = useMemo(
    () =>
      applySort(rows ?? [], sort, (txn, key) =>
        key === "date"
          ? new Date(txn.date).getTime()
          : key === "amount"
            ? txn.amount
            : key === "type"
              ? txn.type
              : txn.description || ""
      ),
    [rows, sort]
  )
  const total = (rows ?? []).reduce((sum, t) => sum + (t.amount || 0), 0)

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="modal-positioner">
            <motion.div
              className="modal reports-modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="modal-header">
                <div className="reports-modal-title">
                  <span className="inv-type-badge inv-type-badge--advia">ADVIA</span>
                  <div>
                    <h2 className="title2 emphasized">Cash in Bank</h2>
                    <span className="reports-modal-subtitle">
                      {isLoading
                        ? "Loading transactions…"
                        : `${(rows ?? []).length} transaction${(rows ?? []).length === 1 ? "" : "s"} · last 45 days · ${formatMoneyFull(total)}`}
                    </span>
                  </div>
                </div>
                <button className="button modal-close" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>

              <div className="reports-modal-body">
                {isLoading ? (
                  <p className="reports-modal-empty body-text text-secondary">Loading transactions…</p>
                ) : (rows ?? []).length === 0 ? (
                  <p className="reports-modal-empty body-text text-secondary">
                    No transactions in the last 45 days.
                  </p>
                ) : (
                  <table className="data-table billings-invoice-table">
                    <thead>
                      <tr>
                        <SortableHeader label="Date" columnKey="date" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Type" columnKey="type" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Description" columnKey="description" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Amount" columnKey="amount" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((txn, i) => (
                        <tr key={`${txn.recnum}-${i}`}>
                          <td className="text-secondary">{formatDate(new Date(txn.date))}</td>
                          <td>
                            <span className={`inv-type-badge inv-type-badge--${txn.type.toLowerCase()}`}>{txn.type}</span>
                          </td>
                          <td>
                            {txn.description || "—"}
                            {txn.vendorName && <span className="text-secondary"> · {txn.vendorName}</span>}
                          </td>
                          <td className="num" style={{ color: txn.type === "AR" ? AR_COLOR : AP_COLOR }}>
                            {formatMoneyFull(txn.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3}>Total</td>
                        <td className="num">{formatMoneyFull(total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

export function BankingWidget() {
  const { data, isLoading } = useWidgetData<{
    agingSummary: AgingSummaryRow[] | null
    loc: LocPayload | null
  }>(["agingSummary", "loc"])

  const cash = rowAmount(data?.agingSummary, "CASH")
  const limit = typeof data?.loc?.loc === "number" ? data.loc.loc : null
  const drawn = rowAmount(data?.agingSummary, "CreditSpent")
  const locReady = drawn != null && limit != null
  const over = locReady && drawn > limit
  const pctDrawn = locReady && limit > 0 ? (drawn / limit) * 100 : 0

  const [txnsOpen, setTxnsOpen] = useState(false)

  return (
    <>
      <StatPairCard
        title="Banking"
        loading={isLoading}
        className="banking-card billings-overdue-card"
        actions={<span className="bank-brand">ADVIA</span>}
        top={
          <button
            type="button"
            className="overdue-line"
            onClick={() => setTxnsOpen(true)}
            title="View bank activity (last 45 days)"
          >
            <span className="overdue-line-head">
              <span className="overdue-line-title">Cash in Bank</span>
            </span>
            <div className="bank-cash-line">
              <span className={`bank-cash-value${cash != null && cash < 0 ? " bank-cash-value--neg" : ""}`}>
                {cash != null ? formatMoneyFull(cash) : "—"}
              </span>
              {cash != null && cash < 0 && <span className="bank-pill bank-pill--over">Overdrawn</span>}
            </div>
          </button>
        }
        bottom={
          <div className="bank-row">
            <span className="bank-row-label">Line of Credit</span>
            <div className={`bank-meter${over ? " bank-meter--over" : ""}`}>
              <div className="bank-meter-fill" style={{ width: `${Math.min(100, pctDrawn)}%` }} />
            </div>
            {locReady && (
              <div className="bank-loc-foot">
                <span>{formatMoneyFull(drawn)} drawn of {formatMoneyFull(limit)}</span>
                {over && <span className="bank-loc-over">Over {formatMoneyFull(drawn - limit)}</span>}
              </div>
            )}
          </div>
        }
      />

      <BankTransactionsModal open={txnsOpen} onClose={() => setTxnsOpen(false)} />
    </>
  )
}
