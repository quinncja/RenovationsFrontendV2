import { useState, type ReactNode } from "react"
import { InvoiceDetailModal } from "../../../shared/components/InvoiceDetailModal/InvoiceDetailModal"
import { formatMoneyFull, formatRelativeTime } from "../../../shared/utils/format"
import { useJobcostNav } from "../../jobcost/useJobcostNav"
import type { RecentChangeItem } from "../widgets/recent/recentTypes"
import { rowParts } from "../widgets/recent/recentPresentation"
import { ItemDetailModal } from "../widgets/recent/ItemDetailModal"
import type { DateRange } from "./chicagoDate"

// ─── Item drill-down ─────────────────────────────────────────────────────────
// Shared by every report surface (daily modal tiles, Reports page feed).
// Invoice-shaped items open the app's existing invoice modal — it self-fetches
// by recnum; a payment's deeper look is the AR invoice it paid (its id is
// "<invoice recnum>-<timestamp>"). Everything else (projects, POs, subs, cost
// postings) gets the generic detail modal, windowed so cost-line fetches match
// the report's range rather than the default last-business-day cutoff.

// The tooltip shown when a drill-down's "View project" is blocked — during the
// intro walkthrough the user is kept inside the recap until they finish it.
export const INTRO_PROJECT_BLOCK =
  "Normally, this project button will be clickable. For now, please finish the introduction to Daily Recap."

export function useItemDrilldown({
  backLabel,
  window,
  blockProjectNav = false,
}: {
  /** Jobcost back-button label for "View project" (see useJobcostNav). */
  backLabel: string
  /** Report range, threaded into cost-line drill-downs. */
  window?: DateRange
  /** Block the "View project" jump (the intro walkthrough): the link goes inert
   *  and shows INTRO_PROJECT_BLOCK as a tooltip instead of navigating away. */
  blockProjectNav?: boolean
}): { openItem: (item: RecentChangeItem) => void; modals: ReactNode } {
  const [selected, setSelected] = useState<RecentChangeItem | null>(null)
  const [invoice, setInvoice] = useState<{ id: string; module: "clients" | "suppliers" } | null>(
    null
  )
  const { goToJobcost } = useJobcostNav()

  const openItem = (item: RecentChangeItem) => {
    if (item.kind === "arInvoice") setInvoice({ id: item.id, module: "clients" })
    else if (item.kind === "payment") setInvoice({ id: item.id.split("-")[0], module: "clients" })
    else if (item.kind === "apInvoice") setInvoice({ id: item.id, module: "suppliers" })
    else setSelected(item)
  }

  const projectBlockedReason = blockProjectNav ? INTRO_PROJECT_BLOCK : null

  const modals = (
    <>
      <ItemDetailModal
        item={selected}
        onClose={() => setSelected(null)}
        onViewProject={(jobId) => goToJobcost(jobId, { backLabel })}
        window={window}
        projectBlockedReason={projectBlockedReason}
      />
      <InvoiceDetailModal
        invoiceId={invoice?.id ?? null}
        module={invoice?.module ?? "clients"}
        onClose={() => setInvoice(null)}
        projectBlockedReason={projectBlockedReason}
      />
    </>
  )

  return { openItem, modals }
}

// ─── Feed rows ───────────────────────────────────────────────────────────────
// The event list the Recent Changes cards rendered, extracted verbatim (same
// `.rcnt-*` classes) so report surfaces read as the same feed.

export function ActivityFeedRows({
  items,
  onSelect,
  modal = false,
}: {
  items: RecentChangeItem[]
  onSelect: (item: RecentChangeItem) => void
  /** Inside a modal body the rows take the wider `--modal` treatment. */
  modal?: boolean
}) {
  return (
    <ul className="rcnt-feed">
      {items.map((item) => {
        const { pill, primary, secondary } = rowParts(item)
        return (
          <li
            key={`${item.kind}-${item.id}`}
            className={`rcnt-event${modal ? " rcnt-event--modal" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(item)}
            onKeyDown={(e) => e.key === "Enter" && onSelect(item)}
          >
            <span className="rcnt-event-badge">
              <span className={`rcnt-pill rcnt-pill--${item.kind}`}>{pill}</span>
            </span>
            <div className="rcnt-event-body">
              <span className="rcnt-event-title">{primary}</span>
              {secondary && <span className="rcnt-event-meta">{secondary}</span>}
            </div>
            <div className="rcnt-event-side">
              {item.amount ? (
                <span className="rcnt-event-amt">{formatMoneyFull(item.amount)}</span>
              ) : (
                <span className="rcnt-event-amt rcnt-event-amt--none">No amount</span>
              )}
              <span className="rcnt-event-time">{formatRelativeTime(item.occurredAt)}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
