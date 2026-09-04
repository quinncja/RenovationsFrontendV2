import { useState, useEffect } from "react"
import { useJobcostNav } from "../../../modules/jobcost/useJobcostNav"
import { usePartnerNav, type PartnerKind } from "../../../modules/directory/usePartnerNav"
import { fetchPageData } from "../../api/pageApi"
import { formatMoneyFull, formatDate, formatRelativeTime } from "../../utils/format"
import { transformUsername } from "../MonthlyDetailTable/MonthlyDetailTable"
import {
  DetailModal,
  DetailModalContent,
  type DetailStat,
  type DetailLineGroup,
} from "../DetailModal/DetailModal"
import { invoiceStatusLabel, invoiceStatusTone } from "../../utils/invoiceStatus"

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
  /** Directory recnums behind the party names (reccln/actpay), for the
   *  click-through to the partner page. Optional: an older backend deploy
   *  won't send them and the party stays plain text. */
  clientId?: number | null
  vendorId?: number | null
  /** Sage audit stamp (acpinv/acrinv insusr + insdte). Optional: an older
   *  backend deploy won't send them and the footer is omitted. */
  enteredBy?: string | null
  enteredAt?: string | null
}

// A job-cost row the AP invoice posted (jobcst via lgrrec) — the invoice's
// distribution across jobs and cost types.
interface APInvoiceCostLine {
  costRecnum: string
  jobNum: string | null
  jobName: string | null
  costType: number | null
  amount: number
  description: string | null
}

// AP lines carry an account; AR lines carry qty/unit/price.
interface APInvoiceLine {
  accountNum: string
  description: string | null
  amount: number
  /** Job-cost coding (apivln jobnum / phsnum / csttyp). Optional: an older
   *  backend, or a Sage install without the columns, sends none. */
  jobNum?: string | null
  jobName?: string | null
  phase?: number | null
  costType?: number | null
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
  groups: DetailLineGroup[] | null
  heading?: string
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

// Which directory page the invoice's party lives on, per module. "suppliers"
// maps to the /vendors route — there is no /suppliers route.
const MODULE_PARTNER_KIND: Record<InvoiceDetailModalProps["module"], PartnerKind> = {
  clients: "client",
  suppliers: "vendor",
  subcontractors: "subcontractor",
}

// ─── Line normalization ───────────────────────────────────────────────────────

function formatQty(q: number) {
  return q % 1 === 0 ? String(q) : q.toLocaleString("en-US", { maximumFractionDigits: 4 })
}

// Sage cost-type codes, as the jobcost breakdown labels them.
const COST_TYPE_LABEL: Record<number, string> = { 1: "Materials", 2: "Labor", 3: "Equipment", 4: "Subcontractor", 5: "WTPM" }
function costTypeLabel(t: number | null | undefined) {
  return t == null ? null : COST_TYPE_LABEL[t] ?? "Other"
}
function jobLabel(l: APInvoiceLine) {
  if (!l.jobNum) return null
  return l.jobName ? `${l.jobName}` : `Job ${l.jobNum}`
}

function apLineToItem(l: APInvoiceLine, withJob: boolean): LedgerItem {
  const primary = l.description || `Account ${l.accountNum}`
  const coding = [costTypeLabel(l.costType), withJob ? jobLabel(l) : null].filter(Boolean).join(" · ")
  const account = l.description ? `Account ${l.accountNum}` : null
  return {
    primary,
    meta: [coding || null, account].filter(Boolean).join(" · ") || null,
    amount: l.amount,
  }
}

// Every line of the invoice, always — a cost item is often one coded line of
// a bigger invoice, and the reader needs the rest to see where the total
// went. Lines coded to more than one job group by job with a subtotal; on a
// single-job invoice the job is already the modal's project link, so each
// line carries only its cost type.
// The job-cost distribution leads when the invoice has one: it is the split
// the reader came from (a cost item is one of these rows). Grouped by job
// whenever the rows span more than one; a single job's rows list flat with
// their cost type, the job being the modal's project link already.
function apCostLinesToLedger(rows: APInvoiceCostLine[]): { lines: LedgerItem[]; groups: DetailLineGroup[] | null } {
  const toItem = (r: APInvoiceCostLine): LedgerItem => ({
    primary: r.description || costTypeLabel(r.costType) || "Job cost",
    meta: r.description ? costTypeLabel(r.costType) : null,
    amount: r.amount,
  })
  const jobs = new Set(rows.map((r) => r.jobNum ?? ""))
  const flat = rows.map(toItem)
  if (jobs.size <= 1) return { lines: flat, groups: null }
  const byJob = new Map<string, DetailLineGroup>()
  for (const r of rows) {
    const key = r.jobNum ?? ""
    let g = byJob.get(key)
    if (!g) {
      g = { heading: r.jobName || (r.jobNum ? `Job ${r.jobNum}` : "No job"), meta: r.jobNum && r.jobName ? `#${r.jobNum}` : null, subtotal: 0, lines: [] }
      byJob.set(key, g)
    }
    g.lines.push(toItem(r))
    g.subtotal += r.amount
  }
  return { lines: flat, groups: [...byJob.values()] }
}

function apLinesToLedger(lines: APInvoiceLine[]): { lines: LedgerItem[]; groups: DetailLineGroup[] | null } {
  const jobs = new Set(lines.map((l) => l.jobNum ?? ""))
  const multiJob = jobs.size > 1
  const flat = lines.map((l) => apLineToItem(l, false))
  if (!multiJob) return { lines: flat, groups: null }
  const byJob = new Map<string, { heading: string; meta: string | null; lines: LedgerItem[]; subtotal: number }>()
  for (const l of lines) {
    const key = l.jobNum ?? ""
    let g = byJob.get(key)
    if (!g) {
      g = {
        heading: jobLabel(l) ?? "No job",
        meta: l.jobNum && l.jobName ? `#${l.jobNum}` : null,
        lines: [],
        subtotal: 0,
      }
      byJob.set(key, g)
    }
    g.lines.push(apLineToItem(l, false))
    g.subtotal += l.amount
  }
  return { lines: flat, groups: [...byJob.values()] }
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
        : ["supplierInvoiceDetail", "supplierInvoiceLines", "supplierInvoiceCostLines"]

    fetchPageData({ module: "invoices", queries, params: { invoiceRecnum: recnum } })
      .then((data) => {
        if (cancelled) return
        if (module === "clients") {
          const header = data.clientInvoiceDetail as InvoiceHeader | null
          if (!header) { setError("Invoice not found."); setIsLoading(false); return }
          setDetail({ header, lines: arLinesToLedger((data.clientInvoiceLines as ARInvoiceLine[]) ?? []), groups: null })
        } else {
          const header = data.supplierInvoiceDetail as InvoiceHeader | null
          if (!header) { setError("Invoice not found."); setIsLoading(false); return }
          const costRows = (data.supplierInvoiceCostLines as APInvoiceCostLine[] | null) ?? []
          const ap = costRows.length > 0
            ? apCostLinesToLedger(costRows)
            : apLinesToLedger((data.supplierInvoiceLines as APInvoiceLine[]) ?? [])
          setDetail({ header, lines: ap.lines, groups: ap.groups, heading: costRows.length > 0 ? "Job cost distribution" : "Line items" })
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
  const { canViewPartners, goToPartner } = usePartnerNav()
  const h = detail.header
  const party = module === "clients" ? h.clientName : h.vendorName
  const partyId = module === "clients" ? h.clientId : h.vendorId
  const hasDesc = Boolean(h.description)
  // The description is what the invoice is FOR, so it leads as the name; the
  // invoice number rides small beside the eyebrow. When there's no description
  // the number becomes the name, so we don't repeat it in the caption.
  const title = hasDesc ? h.description! : `Invoice ${h.invoiceNum}`
  const caption = hasDesc ? `#${h.invoiceNum}` : null
  const enteredBy = transformUsername(h.enteredBy)

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
              label: invoiceStatusLabel(h.status),
              className: `badge badge--${invoiceStatusTone(h.status)} badge--standard`,
            }
          : null
      }
      stats={stats}
      title={title}
      caption={caption}
      party={party || null}
      // Party click-through to the partner's directory page. Suppressed while
      // the daily-recap intro blocks navigation, and for roles that can't
      // reach the directory routes.
      onPartyOpen={
        canViewPartners && !projectBlockedReason && partyId != null
          ? () => goToPartner(MODULE_PARTNER_KIND[module], partyId)
          : null
      }
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
      ledger={detail.lines.length > 0 ? { heading: detail.heading ?? "Line items", lines: detail.lines, groups: detail.groups } : null}
      // Provenance reads last and quiet, as on the recap's item modal — who
      // keyed the invoice on the left, when on the right.
      footer={
        enteredBy || h.enteredAt
          ? {
              left: enteredBy ? `Entered by ${enteredBy}` : "Entered",
              right: h.enteredAt ? `${formatDate(h.enteredAt)} · ${formatRelativeTime(h.enteredAt)}` : null,
            }
          : null
      }
    />
  )
}
