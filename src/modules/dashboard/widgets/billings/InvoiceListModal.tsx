import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { SortableHeader } from "../../../../shared/components/SortableHeader"
import { useTableSort, applySort } from "../../../../shared/hooks/useTableSort"
import { useModalLayer } from "../../../../shared/hooks/useModalLayer"
import { formatMoneyFull, formatDate } from "../../../../shared/utils/format"
import type { OverdueInvoice } from "../../utils/agingForecast"
import { AR_COLOR, AP_COLOR } from "./billingsShared"

type SortKey = "counterparty" | "invnum" | "job" | "due" | "daysOverdue" | "amount"

/**
 * The per-invoice list behind one side (AR or AP) of a billings card. Shared
 * by Overdue Billings (invoices past their mark) and Open Position (every
 * open invoice) — the two differ only in which rows they hand in and what the
 * age column means, so `ageLabel` renders that column.
 */
export function InvoiceListModal({
  side,
  title,
  invoices,
  ageColumnLabel = "Overdue",
  ageLabel = (inv) => `${inv.daysOverdue}d`,
  onClose,
  onSelectInvoice,
}: {
  /** Null closes the modal; the side also picks the figure color. */
  side: "AR" | "AP" | null
  title: string
  invoices: OverdueInvoice[]
  ageColumnLabel?: string
  ageLabel?: (inv: OverdueInvoice) => string
  onClose: () => void
  onSelectInvoice: (recnum: string) => void
}) {
  const sort = useTableSort<SortKey>("daysOverdue", "desc")
  const { overlayZ, contentZ, isTopLayer } = useModalLayer(!!side)
  const sorted = applySort(invoices, sort, (inv, key) =>
    key === "due"
      ? inv.due.getTime()
      : key === "amount"
        ? inv.amount
        : key === "daysOverdue"
          ? inv.daysOverdue
          : key === "invnum"
            ? inv.invnum
            : key === "job"
              ? inv.job
              : inv.counterparty
  )
  const total = invoices.reduce((sum, i) => sum + i.amount, 0)
  const color = side === "AR" ? AR_COLOR : AP_COLOR

  return createPortal(
    <AnimatePresence>
      {side && (
        <>
          <motion.div
            className={`modal-overlay${isTopLayer ? " modal-overlay--blur" : ""}`}
            style={{ zIndex: overlayZ }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="modal-positioner" style={{ zIndex: contentZ }}>
            <motion.div
              className="modal reports-modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="modal-header">
                <div className="reports-modal-title">
                  <span className={`inv-type-badge inv-type-badge--${side.toLowerCase()}`}>{side}</span>
                  <div>
                    <h2 className="title2 emphasized">{title}</h2>
                    <span className="reports-modal-subtitle">
                      {invoices.length} invoice{invoices.length === 1 ? "" : "s"} · {formatMoneyFull(total)}
                    </span>
                  </div>
                </div>
                <button className="button modal-close" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>

              <div className="reports-modal-body">
                {invoices.length === 0 ? (
                  <p className="reports-modal-empty body-text text-secondary">No invoices.</p>
                ) : (
                  <table className="data-table billings-invoice-table">
                    <thead>
                      <tr>
                        <SortableHeader label="Client / Vendor" columnKey="counterparty" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Invoice" columnKey="invnum" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Job" columnKey="job" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Due" columnKey="due" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label={ageColumnLabel} columnKey="daysOverdue" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                        <SortableHeader label="Amount" columnKey="amount" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((inv, i) => (
                        <tr
                          key={`${inv.invnum}-${i}`}
                          className={inv.recnum ? "clickable-row" : undefined}
                          onClick={inv.recnum ? () => onSelectInvoice(inv.recnum) : undefined}
                          title={inv.recnum ? "View invoice details" : undefined}
                          tabIndex={inv.recnum ? 0 : undefined}
                          role={inv.recnum ? "button" : undefined}
                          onKeyDown={inv.recnum ? (e) => e.key === "Enter" && onSelectInvoice(inv.recnum) : undefined}
                        >
                          <td>{inv.counterparty || "—"}</td>
                          <td className="text-secondary">{inv.invnum || "—"}</td>
                          <td className="text-secondary">{inv.job || "—"}</td>
                          <td className="text-secondary">{formatDate(inv.due)}</td>
                          <td className="num text-secondary">{ageLabel(inv)}</td>
                          <td className="num" style={{ color }}>{formatMoneyFull(inv.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={5}>Total</td>
                        <td className="num" style={{ color }}>{formatMoneyFull(total)}</td>
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
