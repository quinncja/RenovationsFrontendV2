import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { useJobcostNav } from "../../../modules/jobcost/useJobcostNav"
import { X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { fetchPageData } from "../../api/pageApi"
import { formatMoneyFull, formatDate } from "../../utils/format"

// ─── Status labels & classes ──────────────────────────────────────────────────

const INVOICE_STATUS: Record<number, string> = {
  1: "Open",
  2: "Review",
  3: "Dispute",
  4: "Paid",
  5: "Void",
}
const INVOICE_STATUS_CLASS: Record<number, string> = {
  1: "open",
  2: "review",
  3: "dispute",
  4: "paid",
  5: "void",
}
function invoiceStatus(n: number) { return INVOICE_STATUS[n] ?? `Status ${n}` }
function invoiceStatusClass(n: number) { return INVOICE_STATUS_CLASS[n] ?? "open" }
function formatAmount(v: number | null | undefined) {
  return v == null || isNaN(v) ? "N/A" : formatMoneyFull(v)
}

// ─── Data shapes ─────────────────────────────────────────────────────────────

interface ClientInvoiceDetail {
  invoiceNum: string
  total: number
  retainage: number
  amountPaid: number
  amountRemaining: number
  postYear: number
  invoiceDate: unknown
  dueDate: unknown
  status: number
  jobName: string | null
  jobNum: string | null
  clientName: string | null
  description: string | null
}

interface APInvoiceDetail {
  invoiceNum: string
  total: number
  retainage: number
  amountPaid: number
  amountRemaining: number
  postYear: number
  invoiceDate: unknown
  dueDate: unknown
  status: number
  vendorName: string
  description: string | null
}

interface InvoiceLine {
  accountNum: string
  description: string | null
  amount: number
}

type InvoiceDetail =
  | { module: "clients"; header: ClientInvoiceDetail }
  | { module: "suppliers" | "subcontractors"; header: APInvoiceDetail; lines: InvoiceLine[] }

// ─── Props ────────────────────────────────────────────────────────────────────

interface InvoiceDetailModalProps {
  invoiceId: string | null
  module: "clients" | "suppliers" | "subcontractors"
  onClose: () => void
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "" || value === "—") return null
  return (
    <div className="invoice-modal-row">
      <span className="invoice-modal-label">{label}</span>
      <span className="invoice-modal-value">{value}</span>
    </div>
  )
}

function AmountsStrip({ total, paid, remaining, retainage }: {
  total: number; paid: number; remaining: number; retainage: number
}) {
  const cols = retainage > 0 ? 4 : 3
  return (
    <div className="invoice-amounts-strip" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      <div className="invoice-amount-cell">
        <span className="invoice-amount-label">Total</span>
        <span className="invoice-amount-value">{formatAmount(total)}</span>
      </div>
      <div className="invoice-amount-cell">
        <span className="invoice-amount-label">Paid</span>
        <span className="invoice-amount-value invoice-amount-value--paid">{formatAmount(paid)}</span>
      </div>
      <div className="invoice-amount-cell">
        <span className="invoice-amount-label">Remaining</span>
        <span className="invoice-amount-value invoice-amount-value--remaining">{formatAmount(remaining)}</span>
      </div>
      {retainage > 0 && (
        <div className="invoice-amount-cell">
          <span className="invoice-amount-label">Retainage</span>
          <span className="invoice-amount-value">{formatAmount(retainage)}</span>
        </div>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InvoiceDetailModal({ invoiceId, module, onClose }: InvoiceDetailModalProps) {
  const [detail, setDetail] = useState<InvoiceDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!invoiceId) { setDetail(null); setError(null); return }

    const recnum = parseInt(invoiceId, 10)
    if (isNaN(recnum)) return

    let cancelled = false
    setIsLoading(true)
    setDetail(null)
    setError(null)

    // All invoice-detail queries live on the dashboard/home-data endpoint.
    // Subcontractors are AP vendors, so they reuse the supplier (AP) queries.
    const queries =
      module === "clients"
        ? ["clientInvoiceDetail"]
        : ["supplierInvoiceDetail", "supplierInvoiceLines"]

    fetchPageData({ module: "invoices", queries, params: { invoiceRecnum: recnum } })
      .then((data) => {
        if (cancelled) return
        if (module === "clients") {
          const header = data.clientInvoiceDetail as ClientInvoiceDetail | null
          if (!header) { setError("Invoice not found."); setIsLoading(false); return }
          setDetail({ module: "clients", header })
        } else {
          const header = data.supplierInvoiceDetail as APInvoiceDetail | null
          if (!header) { setError("Invoice not found."); setIsLoading(false); return }
          setDetail({ module, header, lines: (data.supplierInvoiceLines as InvoiceLine[]) ?? [] })
        }
        setIsLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError("Failed to load invoice details.")
        setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [invoiceId, module])

  const invoiceNum = detail?.header.invoiceNum
  const statusNum  = detail?.header.status
  const subtitle   = detail
    ? detail.module === "clients"
      ? detail.header.clientName
      : detail.header.vendorName
    : null

  return createPortal(
    <AnimatePresence>
      {invoiceId && (
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
              className="modal invoice-modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {/* Header */}
              <div className="invoice-modal-header">
                <div className="invoice-modal-header-left">
                  <div className="invoice-modal-title-row">
                    <h2 className="invoice-modal-title">
                      {invoiceNum ? `Invoice ${invoiceNum}` : isLoading ? "Loading…" : "Invoice"}
                    </h2>
                    {statusNum != null && (
                      <span className={`invoice-status-badge invoice-status-badge--${invoiceStatusClass(statusNum)}`}>
                        {invoiceStatus(statusNum)}
                      </span>
                    )}
                  </div>
                  {subtitle && <p className="invoice-modal-subtitle">{subtitle}</p>}
                </div>
                <button className="button modal-close" onClick={onClose}><X size={16} /></button>
              </div>

              {/* Body */}
              <div className="invoice-modal-body">
                {isLoading && <div className="widget-skeleton" style={{ height: "9rem" }} />}
                {error && <p className="body-text text-secondary">{error}</p>}

                {!isLoading && !error && detail && (
                  detail.module === "clients"
                    ? <ClientInvoiceBody header={detail.header} />
                    : <APInvoiceBody header={detail.header} lines={detail.lines} />
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

// ─── AR invoice body ──────────────────────────────────────────────────────────

function ClientInvoiceBody({ header: h }: { header: ClientInvoiceDetail }) {
  const { goToJobcost } = useJobcostNav()
  return (
    <div className="invoice-modal-sections">
      <AmountsStrip
        total={h.total}
        paid={h.amountPaid}
        remaining={h.amountRemaining}
        retainage={h.retainage}
      />

      {h.jobNum && (
        <section
          className="invoice-modal-section invoice-modal-section-link"
          onClick={() => goToJobcost(h.jobNum!)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && goToJobcost(h.jobNum!)}
        >
          <p className="invoice-modal-section-label">Job</p>
          <div className="invoice-modal-info">
            <InfoRow label="Job #"     value={h.jobNum} />
            <InfoRow label="Job Name"  value={h.jobName} />
          </div>
        </section>
      )}

      <section className="invoice-modal-section">
        <p className="invoice-modal-section-label">Details</p>
        <div className="invoice-modal-info">
          <InfoRow label="Invoice #"   value={h.invoiceNum} />
          <InfoRow label="Description" value={h.description} />
          <InfoRow label="Year"        value={h.postYear} />
          <InfoRow label="Date"        value={formatDate(h.invoiceDate)} />
          <InfoRow label="Due Date"    value={formatDate(h.dueDate)} />
        </div>
      </section>
    </div>
  )
}

// ─── AP invoice body ──────────────────────────────────────────────────────────

function APInvoiceBody({ header: h, lines }: { header: APInvoiceDetail; lines: InvoiceLine[] }) {
  return (
    <div className="invoice-modal-sections">
      <AmountsStrip
        total={h.total}
        paid={h.amountPaid}
        remaining={h.amountRemaining}
        retainage={h.retainage}
      />

      <section className="invoice-modal-section">
        <p className="invoice-modal-section-label">Details</p>
        <div className="invoice-modal-info">
          <InfoRow label="Invoice #"   value={h.invoiceNum} />
          <InfoRow label="Description" value={h.description} />
          <InfoRow label="Year"        value={h.postYear} />
          <InfoRow label="Date"        value={formatDate(h.invoiceDate)} />
          <InfoRow label="Due Date"    value={formatDate(h.dueDate)} />
        </div>
      </section>

      {lines.length > 0 && (
        <section className="invoice-modal-section">
          <p className="invoice-modal-section-label">Cost Distribution</p>
          <table className="spend-rank-table">
            <thead>
              <tr>
                <th className="spend-rank-table-name">Account</th>
                <th className="spend-rank-table-name">Description</th>
                <th className="spend-rank-table-value">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="spend-rank-table-row-plain">
                  <td className="spend-rank-table-name body-text">{line.accountNum}</td>
                  <td className="spend-rank-table-name body-text text-secondary">{line.description || "—"}</td>
                  <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
