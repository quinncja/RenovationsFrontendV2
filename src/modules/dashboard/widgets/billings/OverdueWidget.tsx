import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X, ArrowDown, ArrowUp } from "lucide-react"
import { StatPairCard } from "../StatPairCard"
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

  // Net overdue position: receivables (money in) minus payables (money out).
  const net = forecast ? forecast.overdueAR - forecast.overdueAP : 0

  return (
    <>
      <StatPairCard
        title="Overdue Billings"
        loading={isLoading}
        noData={!forecast}
        className="billings-overdue-card"
        top={
          forecast && (
            <button
              type="button"
              className="overdue-line overdue-line--ar"
              onClick={() => setOpenSide("AR")}
              disabled={forecast.overdueARCount === 0}
              title="View overdue AR invoices"
            >
              <span className="overdue-line-head">
                <span className="overdue-line-title">
                  <span className="overdue-line-code overdue-line-code--ar">AR</span>
                </span>
                <span className="overdue-line-dir"><ArrowDown size={13} /> in</span>
              </span>
              <span className="overdue-line-value">{formatMoneyFull(forecast.overdueAR)}</span>
              <span className="overdue-line-sub">{invoiceLabel(forecast.overdueARCount)}</span>
            </button>
          )
        }
        bottom={
          forecast && (
            <button
              type="button"
              className="overdue-line overdue-line--ap"
              onClick={() => setOpenSide("AP")}
              disabled={forecast.overdueAPCount === 0}
              title="View overdue AP invoices"
            >
              <span className="overdue-line-head">
                <span className="overdue-line-title">
                  <span className="overdue-line-code overdue-line-code--ap">AP</span>
                </span>
                <span className="overdue-line-dir"><ArrowUp size={13} /> out</span>
              </span>
              <span className="overdue-line-value">{formatMoneyFull(forecast.overdueAP)}</span>
              <span className="overdue-line-sub">{invoiceLabel(forecast.overdueAPCount)}</span>
            </button>
          )
        }
        footer={
          forecast && (
            <>
              <span className="overdue-net-label">Net overdue position</span>
              <span className={`overdue-net-value${net < 0 ? " overdue-net-value--neg" : ""}`}>
                {formatMoneyFull(net)}
              </span>
            </>
          )
        }
      />

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
    </>
  )
}
