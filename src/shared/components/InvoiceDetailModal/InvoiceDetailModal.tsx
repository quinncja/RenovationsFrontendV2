import { useState, useEffect } from "react"
import { useJobcostNav } from "../../../modules/jobcost/useJobcostNav"
import { fetchPageData } from "../../api/pageApi"
import { formatMoneyFull, formatDate } from "../../utils/format"
import {
  DetailModal,
  DetailModalContent,
  type DetailStat,
} from "../DetailModal/DetailModal"

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

// AR (client) and AP (vendor/sub) headers share every field the modal renders;
// only the party name differs. Kept as one shape with both party fields optional.
interface InvoiceHeader {
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
  description: string | null
  clientName?: string | null
  vendorName?: string | null
}

// AP lines carry an account; AR lines carry qty/unit/price.
interface APInvoiceLine {
  accountNum: string
  description: string | null
  amount: number
}
interface ARInvoiceLine {
  lineNum: number
  description: string | null
  quantity: number
  unit: string | null
  unitPrice: number
  amount: number
}

export interface LedgerItem {
  primary: string
  meta?: string | null
  amount: number
}

interface InvoiceDetail {
  header: InvoiceHeader
  lines: LedgerItem[]
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface InvoiceDetailModalProps {
  invoiceId: string | null
  module: "clients" | "suppliers" | "subcontractors"
  onClose: () => void
  /** When set, the project link is inert and surfaces this as a tooltip instead
   *  of navigating (the daily-recap intro blocks leaving until it's finished). */
  projectBlockedReason?: string | null
}

// The eyebrow says which ledger this invoice lives on — AR (client, we billed
// them) vs AP (vendor/subcontractor, they billed us). The party name in the meta
// line already says whether it's a vendor or a subcontractor.
const MODULE_KIND: Record<InvoiceDetailModalProps["module"], string> = {
  clients: "AR invoice",
  suppliers: "AP invoice",
  subcontractors: "AP invoice",
}

// ─── Line normalization ───────────────────────────────────────────────────────

function formatQty(q: number) {
  return q % 1 === 0 ? String(q) : q.toLocaleString("en-US", { maximumFractionDigits: 4 })
}

function apLinesToLedger(lines: APInvoiceLine[]): LedgerItem[] {
  return lines.map((l) => ({
    primary: l.description || `Account ${l.accountNum}`,
    meta: l.description ? `Account ${l.accountNum}` : null,
    amount: l.amount,
  }))
}

function arLinesToLedger(lines: ARInvoiceLine[]): LedgerItem[] {
  return lines.map((l) => {
    // qty × price only adds information beyond the amount when it's a real
    // multiple; a 1 × total line would just restate the number.
    const showQty = l.quantity > 0 && l.quantity !== 1 && l.unitPrice > 0
    const meta = showQty
      ? `${formatQty(l.quantity)} × ${formatMoneyFull(l.unitPrice)}${l.unit ? ` / ${l.unit}` : ""}`
      : null
    return {
      primary: l.description || `Line ${l.lineNum}`,
      meta,
      amount: l.amount,
    }
  })
}

// ─── Component ────────────────────────────────────────────────────────────────
// The invoice detail surface shares the name-led layout of the dashboard's
// cost/item modal (the `.cost-detail-*` family): the description leads as the
// name, the party (client/vendor) sits emphasized beneath it, and the amount
// follows — firm but no longer the hero. Invoice-specific data — status,
// paid/remaining, due date — folds into that same structure.

export function InvoiceDetailModal({
  invoiceId,
  module,
  onClose,
  projectBlockedReason,
}: InvoiceDetailModalProps) {
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
        ? ["clientInvoiceDetail", "clientInvoiceLines"]
        : ["supplierInvoiceDetail", "supplierInvoiceLines"]

    fetchPageData({ module: "invoices", queries, params: { invoiceRecnum: recnum } })
      .then((data) => {
        if (cancelled) return
        if (module === "clients") {
          const header = data.clientInvoiceDetail as InvoiceHeader | null
          if (!header) { setError("Invoice not found."); setIsLoading(false); return }
          setDetail({ header, lines: arLinesToLedger((data.clientInvoiceLines as ARInvoiceLine[]) ?? []) })
        } else {
          const header = data.supplierInvoiceDetail as InvoiceHeader | null
          if (!header) { setError("Invoice not found."); setIsLoading(false); return }
          setDetail({ header, lines: apLinesToLedger((data.supplierInvoiceLines as APInvoiceLine[]) ?? []) })
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

  return (
    <DetailModal open={!!invoiceId} onClose={onClose}>
      {isLoading && <div className="widget-skeleton" style={{ height: "9rem" }} />}
      {!isLoading && error && <p className="body-text text-secondary">{error}</p>}
      {!isLoading && !error && detail && (
        <InvoiceContent detail={detail} module={module} projectBlockedReason={projectBlockedReason} />
      )}
    </DetailModal>
  )
}

// ─── Content ──────────────────────────────────────────────────────────────────
// Composes the invoice's view model and renders it through the shared detail
// body: the description leads as the name (invoice # beside the eyebrow, party
// beneath), the amount follows with its status badge, then the
// Paid/Remaining/[Retainage] strip, the project, and the line items.

function InvoiceContent({
  detail,
  module,
  projectBlockedReason,
}: {
  detail: InvoiceDetail
  module: InvoiceDetailModalProps["module"]
  projectBlockedReason?: string | null
}) {
  const { goToJobcost } = useJobcostNav()
  const h = detail.header
  const party = module === "clients" ? h.clientName : h.vendorName
  const hasDesc = Boolean(h.description)
  // The description is what the invoice is FOR, so it leads as the name; the
  // invoice number rides small beside the eyebrow. When there's no description
  // the number becomes the name, so we don't repeat it in the caption.
  const title = hasDesc ? h.description! : `Invoice ${h.invoiceNum}`
  const caption = hasDesc ? `#${h.invoiceNum}` : null

  const stats: DetailStat[] = [
    { label: "Paid", value: formatAmount(h.amountPaid), valueClass: "cost-detail-stat-value--paid" },
    { label: "Remaining", value: formatAmount(h.amountRemaining) },
    ...(h.retainage > 0 ? [{ label: "Retainage", value: formatAmount(h.retainage) }] : []),
    ...(h.dueDate ? [{ label: "Due", value: formatDate(h.dueDate) }] : []),
  ]

  return (
    <DetailModalContent
      eyebrow={MODULE_KIND[module]}
      figure={h.total ? formatMoneyFull(h.total) : null}
      badge={
        h.status != null
          ? {
              label: invoiceStatus(h.status),
              className: `invoice-status-badge invoice-status-badge--${invoiceStatusClass(h.status)}`,
            }
          : null
      }
      stats={stats}
      title={title}
      caption={caption}
      party={party || null}
      project={
        h.jobNum
          ? {
              jobId: h.jobNum,
              jobName: h.jobName,
              onOpen: () => goToJobcost(h.jobNum!),
              blockedReason: projectBlockedReason,
            }
          : null
      }
      ledger={detail.lines.length > 0 ? { heading: "Line items", lines: detail.lines } : null}
    />
  )
}
