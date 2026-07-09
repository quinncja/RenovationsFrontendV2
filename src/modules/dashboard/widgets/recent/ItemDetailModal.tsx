import { useEffect, useState } from "react"
import {
  DetailModal,
  DetailModalContent,
  type DetailLedger,
  type DetailLine,
} from "../../../../shared/components/DetailModal/DetailModal"
import { fetchPageData } from "../../../../shared/api/pageApi"
import { formatDate, formatMoneyFull, formatRelativeTime } from "../../../../shared/utils/format"
import { transformUsername } from "../../../../shared/components/MonthlyDetailTable/MonthlyDetailTable"
import type { RecentChangeItem } from "./recentTypes"
import { KIND_LABEL, rowParts } from "./recentPresentation"

// ─── Line-item drill-down ────────────────────────────────────────────────────
// Three kinds carry a line-item breakdown behind their total, fetched on open:
//   • cost — an aggregate (job × cost type); recentCostLines lists the jobcst
//     rows behind it (id is "<jobnum>-<csttyp>").
//   • purchaseOrder — recentPoLines lists the pcorln rows on the PO.
//   • subcontract — recentSubLines lists the sbcnln rows on the subcontract.
// A PO's / subcontract's id is its header recnum. Everything else is header-only.

interface CostLine {
  description: string | null
  vendorName: string | null
  amount: number
  enteredAt: string
}

interface PoLine {
  lineNum: number
  description: string | null
  partNum: string | null
  unit: string | null
  quantity: number
  unitPrice: number
  amount: number | null
}

interface SubLine {
  lineNum: number
  description: string | null
  amount: number
  billed: number
  remaining: number
}

function formatQty(q: number) {
  return q % 1 === 0 ? String(q) : q.toLocaleString("en-US", { maximumFractionDigits: 4 })
}

function costToLine(l: CostLine): DetailLine {
  return { primary: l.description || "—", meta: l.vendorName, amount: l.amount }
}

function poToLine(l: PoLine): DetailLine {
  const parts: string[] = []
  if (l.partNum && l.partNum !== l.description) parts.push(l.partNum)
  // qty × price only adds information beyond the amount when it's a real
  // multiple; a 1 × total line would just restate the number.
  if (l.quantity > 0 && l.quantity !== 1 && l.unitPrice > 0) {
    parts.push(`${formatQty(l.quantity)} × ${formatMoneyFull(l.unitPrice)}${l.unit ? ` / ${l.unit}` : ""}`)
  }
  return {
    primary: l.description || l.partNum || `Line ${l.lineNum}`,
    meta: parts.length ? parts.join(" · ") : null,
    // Unpriced lines come through as 0 (or null) — render "—" like the header,
    // not "$0", so a PO with no amounts entered reads as such throughout.
    amount: l.amount || null,
  }
}

function subToLine(l: SubLine): DetailLine {
  // Contract value leads; once a line has been billed, its progress is the
  // useful context (how much invoiced, how much still to come).
  const meta =
    l.billed > 0
      ? `${formatMoneyFull(l.billed)} invoiced · ${formatMoneyFull(l.remaining)} remaining`
      : null
  return { primary: l.description || `Line ${l.lineNum}`, meta, amount: l.amount }
}

/** Inclusive day range for the cost-lines fetch; without it the backend
 *  defaults to its last-business-day cutoff (the old widget's window). */
export interface DetailWindow {
  from: string
  to: string
}

function useDetailLines(
  item: RecentChangeItem | null,
  window?: DetailWindow
): { lines: DetailLine[] | null; loading: boolean } {
  const isCost = item !== null && item.kind === "cost" && Boolean(item.jobId)
  const isPo = item !== null && item.kind === "purchaseOrder"
  const isSub = item !== null && item.kind === "subcontract"
  const hasLines = isCost || isPo || isSub
  // Cost: split "<jobnum>-<csttyp>". PO/subcontract: the id is the header recnum.
  const jobnum = isCost ? item!.jobId : null
  const csttyp = isCost ? item!.id.split("-")[1] : null
  const poRecnum = isPo ? item!.id : null
  const subRecnum = isSub ? item!.id : null

  const [lines, setLines] = useState<DetailLine[] | null>(null)

  useEffect(() => {
    if (!hasLines) {
      setLines(null)
      return
    }
    const ctrl = new AbortController()
    setLines(null)

    let request: Promise<DetailLine[]>
    if (isCost) {
      request = fetchPageData({
        module: "dashboard",
        queries: ["recentCostLines"],
        params: window ? { jobnum, csttyp, from: window.from, to: window.to } : { jobnum, csttyp },
        signal: ctrl.signal,
      }).then((data) => ((data.recentCostLines as CostLine[] | null) ?? []).map(costToLine))
    } else if (isPo) {
      request = fetchPageData({
        module: "dashboard",
        queries: ["recentPoLines"],
        params: { poRecnum },
        signal: ctrl.signal,
      }).then((data) => ((data.recentPoLines as PoLine[] | null) ?? []).map(poToLine))
    } else {
      request = fetchPageData({
        module: "dashboard",
        queries: ["recentSubLines"],
        params: { subRecnum },
        signal: ctrl.signal,
      }).then((data) => ((data.recentSubLines as SubLine[] | null) ?? []).map(subToLine))
    }

    request.then(setLines).catch((err) => {
      if (err instanceof Error && err.name === "AbortError") return
      setLines([])
    })
    return () => ctrl.abort()
  }, [hasLines, isCost, isPo, jobnum, csttyp, poRecnum, subRecnum, window?.from, window?.to])

  return { lines, loading: hasLines && lines === null }
}

// ─── Item detail modal ───────────────────────────────────────────────────────
// The deeper look at one non-invoice change (project, PO, subcontract, cost
// posting). Renders through the shared DetailModal primitive, so it reads as the
// same surface as the invoice modal. Invoice-shaped items don't come here; they
// open the real InvoiceDetailModal.

export function ItemDetailModal({
  item,
  onClose,
  onViewProject,
  window,
  projectBlockedReason,
}: {
  item: RecentChangeItem | null
  onClose: () => void
  onViewProject: (jobId: string) => void
  /** Report range for cost-line drill-downs; omit for the default cutoff. */
  window?: DetailWindow
  /** When set, "View project" is inert and surfaces this as a tooltip (used
   *  during the daily-recap intro, which blocks leaving until it's finished). */
  projectBlockedReason?: string | null
}) {
  const open = item !== null
  // Keep the last item through the exit animation.
  const [shown, setShown] = useState(item)
  if (item !== null && item !== shown) setShown(item)
  const meta = shown ? KIND_LABEL[shown.kind] : null
  // `item` (not `shown`) so the fetch cancels when the modal closes.
  const { lines, loading: linesLoading } = useDetailLines(item, window)

  // Costs, POs, and subcontracts carry a line-item breakdown; others are header-only.
  const hasLedger = shown
    ? shown.kind === "cost" || shown.kind === "purchaseOrder" || shown.kind === "subcontract"
    : false
  const ledger: DetailLedger | null = hasLedger
    ? {
        heading: lines && lines.length > 0 ? `${lines.length} lines` : "Lines",
        loading: linesLoading,
        lines: lines ?? [],
        emptyText: "No line detail available.",
      }
    : null

  return (
    <DetailModal open={open} onClose={onClose}>
      {shown && meta && (
        <DetailModalContent
          eyebrow={meta.full}
          figure={shown.amount ? formatMoneyFull(shown.amount) : null}
          title={rowParts(shown).primary.replace(/\s·\s\d+\s+lines?$/i, "")}
          // Vendor/client is context on committed & contract items, emphasized
          // under the name; a posted cost's context is its job, shown at right.
          party={
            shown.kind !== "cost" && shown.party && shown.party !== shown.jobName
              ? shown.party
              : null
          }
          // Provenance reads last and quiet — who on the left, when on the right.
          footer={{
            left: transformUsername(shown.enteredBy)
              ? `Entered by ${transformUsername(shown.enteredBy)}`
              : "Entered",
            right: `${formatDate(shown.occurredAt)} · ${formatRelativeTime(shown.occurredAt)}`,
          }}
          project={
            shown.jobId
              ? {
                  jobId: shown.jobId,
                  jobName: shown.jobName,
                  onOpen: () => onViewProject(shown.jobId!),
                  blockedReason: projectBlockedReason,
                }
              : null
          }
          ledger={ledger}
        />
      )}
    </DetailModal>
  )
}
