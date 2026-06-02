import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { Widget } from "../../../../shared/components/Widget/Widget"
import { InvoiceDetailModal } from "../../../../shared/components/InvoiceDetailModal/InvoiceDetailModal"
import { useWidgetData } from "../../../../shared/context/PageContext"
import { SortableHeader } from "../../../../shared/components/SortableHeader"
import { useTableSort, applySort } from "../../../../shared/hooks/useTableSort"
import { formatMoneyFull, formatDate } from "../../../../shared/utils/format"
import {
  buildAgingForecast,
  buildOverdueInvoices,
  type AgingOpenRow,
} from "../../utils/agingForecast"
import { AR_COLOR, AP_COLOR, invoiceLabel } from "./billingsShared"

type SortKey = "counterparty" | "invnum" | "job" | "due" | "daysOverdue" | "amount"

/** Modal listing the overdue invoices for one side (AR or AP). */
function OverdueModal({
  side,
  rows,
  onClose,
  onSelectInvoice,
}: {
  side: "AR" | "AP" | null
  rows: AgingOpenRow[] | null
  onClose: () => void
  onSelectInvoice: (recnum: string) => void
}) {
  const sort = useTableSort<SortKey>("daysOverdue", "desc")
  const invoices = useMemo(
    () => (side ? buildOverdueInvoices(rows, new Date(), side) : []),
    [rows, side]
  )
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
                  <span className={`inv-type-badge inv-type-badge--${side.toLowerCase()}`}>{side}</span>
                  <div>
                    <h2 className="title2 emphasized">Overdue {side}</h2>
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
                  <p className="reports-modal-empty body-text text-secondary">No overdue invoices.</p>
                ) : (
                  <table className="data-table billings-invoice-table">
                    <thead>
                      <tr>
                        <SortableHeader label="Client / Vendor" columnKey="counterparty" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Invoice" columnKey="invnum" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Job" columnKey="job" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Due" columnKey="due" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Overdue" columnKey="daysOverdue" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
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
                        >
                          <td>{inv.counterparty || "—"}</td>
                          <td className="text-secondary">{inv.invnum || "—"}</td>
                          <td className="text-secondary">{inv.job || "—"}</td>
                          <td className="text-secondary">{formatDate(inv.due)}</td>
                          <td className="num text-secondary">{inv.daysOverdue}d</td>
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

/**
 * Overdue AR/AP positions. Each card is clickable to open a modal listing the
 * invoices in that category.
 */
export function OverdueWidget() {
  const { data, isLoading } = useWidgetData<{ agingSummaryOpen: AgingOpenRow[] | null }>([
    "agingSummaryOpen",
  ])
  const forecast = useMemo(
    () => buildAgingForecast(data?.agingSummaryOpen, new Date()),
    [data?.agingSummaryOpen]
  )
  const [openSide, setOpenSide] = useState<"AR" | "AP" | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<
    { recnum: string; module: "clients" | "suppliers" } | null
  >(null)

  return (
    <Widget title="Overdue" loading={isLoading} noData={!forecast} className="billings-overdue-card">
      {forecast && (
        <div className="billings-positions">
          <button
            type="button"
            className="overdue-stat overdue-ar overdue-stat-clickable"
            onClick={() => setOpenSide("AR")}
            disabled={forecast.overdueARCount === 0}
            title="View overdue AR invoices"
          >
            <span className="overdue-label">AR overdue</span>
            <span className="overdue-amount">{formatMoneyFull(forecast.overdueAR)}</span>
            <span className="overdue-count">{invoiceLabel(forecast.overdueARCount)}</span>
          </button>
          <button
            type="button"
            className="overdue-stat overdue-ap overdue-stat-clickable"
            onClick={() => setOpenSide("AP")}
            disabled={forecast.overdueAPCount === 0}
            title="View overdue AP invoices"
          >
            <span className="overdue-label">AP overdue</span>
            <span className="overdue-amount">{formatMoneyFull(forecast.overdueAP)}</span>
            <span className="overdue-count">{invoiceLabel(forecast.overdueAPCount)}</span>
          </button>
        </div>
      )}

      <OverdueModal
        side={openSide}
        rows={data?.agingSummaryOpen ?? null}
        onClose={() => setOpenSide(null)}
        onSelectInvoice={(recnum) =>
          setSelectedInvoice({ recnum, module: openSide === "AP" ? "suppliers" : "clients" })
        }
      />

      {/* Drill-down: the standard invoice modal, layered above the list. */}
      <InvoiceDetailModal
        invoiceId={selectedInvoice?.recnum ?? null}
        module={selectedInvoice?.module ?? "clients"}
        onClose={() => setSelectedInvoice(null)}
      />
    </Widget>
  )
}
