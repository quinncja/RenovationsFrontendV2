import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { motion, animate, AnimatePresence, useMotionValue } from "framer-motion"
import { ArrowLeftToLine, ArrowUpRight, ChevronLeft, ChevronRight, CircleCheck, CloudOff, X } from "lucide-react"
import { useJobcostNav } from "../../jobcost/useJobcostNav"
import { phaseFromRecnum } from "../../jobcost/jobcostShared"
import useIsMobile from "../../../shared/hooks/useIsMobile"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import { useModalLayer } from "../../../shared/hooks/useModalLayer"
import { SkelText } from "../../../shared/components/SkelText"
import { SegmentedControl } from "../../../shared/components/SegmentedControl"
import { fetchPageData } from "../../../shared/api/pageApi"
import { useItemDrilldown } from "../report/ActivityFeed"
import type { RecentChangeItem } from "../widgets/recent/recentTypes"
import {
  formatDate,
  formatMoneyFull,
  formatRelativeTime,
  marginTextColor,
} from "../../../shared/utils/format"
import { STATUS_LABELS } from "./breakdownRows"
import {
  useWhatsChangedFeed,
  type WhatsChangedItem,
  type WhatsChangedKind,
  type WhatsChangedQuery,
} from "./useWhatsChangedFeed"

// The rail groups events by calendar day — cost batches are per-day by
// construction (one batch = one job × one day), so a per-card "2h ago" was
// false precision. Keys are the wall-clock date part of occurredAt.
function dayKeyOf(occurredAt: string): string {
  return occurredAt.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? ""
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function dayLabel(key: string): string {
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return "Earlier"
  const now = new Date()
  if (key === localDayKey(now)) return "Today"
  if (key === localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)))
    return "Yesterday"
  const d = new Date(+m[1], +m[2] - 1, +m[3])
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(+m[1] !== now.getFullYear() && { year: "numeric" }),
  })
}

function marginDelta(item: WhatsChangedItem): number | null {
  if (item.kind !== "cost" || item.marginBefore == null || item.marginAfter == null) return null
  const delta = item.marginAfter - item.marginBefore
  // A cost batch normally lowers margin; a credit batch raises it. Only a
  // meaningful move is worth showing.
  return Math.abs(delta) >= 0.05 ? delta : null
}

/** Signed margin-move pill. Modal only — under its "Margin" label the points
 *  read has context; the card spells the move out as before → after instead. */
function DeltaChip({ delta }: { delta: number }) {
  return (
    <span className={`wc-delta${delta < 0 ? " wc-delta--down" : " wc-delta--up"}`}>
      {delta > 0 ? "+" : "−"}
      {Math.abs(delta).toFixed(1)} pts
    </span>
  )
}

function KindPill({ item }: { item: WhatsChangedItem }) {
  return item.kind === "status" ? (
    <span className={`status-badge status-${item.newStatus}`}>
      {STATUS_LABELS[item.newStatus ?? 0] ?? "Updated"}
    </span>
  ) : (
    <span className="wc-pill">Costs posted</span>
  )
}

// One property's events for one calendar day, rolled into a single card.
// `parent` is the real Sage grouping key when the job has one — that's what
// makes the header a link to the property page; the jobName fallback keeps
// parentless jobs (one-offs, missing actr_u rows, old backend) as their own
// single-member group under their own name.
interface PropertyGroup {
  key: string
  name: string
  parent: string | null
  items: WhatsChangedItem[]
}

function propertyKeyOf(item: WhatsChangedItem): { key: string; parent: string | null } {
  const parent = item.parent?.trim() || null
  return { key: parent ?? item.jobName, parent }
}

// The per-row identity inside a property card. Phase jobs read as their phase
// month ("Phase 3", the jobcost convention); one-offs read as their given name.
// Null when there's nothing to add beyond the card header (a parentless job's
// row would just repeat the header).
function eventLabel(item: WhatsChangedItem, group: PropertyGroup): string | null {
  const phase = phaseFromRecnum(item.jobId)
  if (phase != null) return `Phase ${phase}`
  const oneoffName = item.oneoffName?.trim()
  if (oneoffName) return oneoffName
  return item.jobName !== group.name ? item.jobName : null
}

// One event inside a property card. Cost rows lead with the amount; a project
// going Complete/Closed is the rarest event on the feed, so its row leads with
// the milestone itself (green for Complete, neutral for Closed).
function EventRow({ item, group, onOpen }: {
  item: WhatsChangedItem
  group: PropertyGroup
  onOpen: (item: WhatsChangedItem) => void
}) {
  const marginColorsOn = useMarginColorsEnabled()
  const marginStyle = (m: number | null) =>
    marginColorsOn && m != null ? { color: marginTextColor(m) } : undefined
  const delta = marginDelta(item)
  const label = eventLabel(item, group)

  if (item.kind === "status") {
    return (
      <button
        type="button"
        className={`wc-event wc-event--milestone${item.newStatus === 6 ? " wc-event--closed" : ""}`}
        onClick={() => onOpen(item)}
        title="View details"
      >
        {label && <span className="wc-event-label caption1">{label}</span>}
        <span className="wc-event-head title3 emphasized">
          <CircleCheck size={19} aria-hidden="true" />
          {STATUS_LABELS[item.newStatus ?? 0] ?? "Updated"}
        </span>
        <span className="wc-event-foot caption1">
          {item.marginAfter != null && (
            <>
              Final margin{" "}
              <span className="emphasized" style={marginStyle(item.marginAfter)}>
                {item.marginAfter.toFixed(1)}%
              </span>
            </>
          )}
        </span>
      </button>
    )
  }

  return (
    <button type="button" className="wc-event" onClick={() => onOpen(item)} title="View details">
      {label && <span className="wc-event-label caption1">{label}</span>}
      <span className="wc-event-amount title3 emphasized">
        {formatMoneyFull(item.amount ?? 0)}
      </span>
      <span className="wc-event-foot caption1">
        {item.marginAfter != null && (
          <>
            Margin{" "}
            {/* A meaningful move reads as before → after — the change itself,
                not a bare points figure the reader has to decode. */}
            {delta != null && item.marginBefore != null && (
              <>
                <span style={marginStyle(item.marginBefore)}>
                  {item.marginBefore.toFixed(1)}%
                </span>
                <span className="wc-margin-arrow" aria-hidden="true">
                  {" "}→{" "}
                </span>
              </>
            )}
            <span className="emphasized" style={marginStyle(item.marginAfter)}>
              {item.marginAfter.toFixed(1)}%
            </span>
          </>
        )}
        {item.marginAfter != null && item.lineCount != null && " · "}
        {item.lineCount != null && `${item.lineCount} ${item.lineCount === 1 ? "line" : "lines"}`}
      </span>
    </button>
  )
}

// Property-first card: the address is the anchor (and the way to the property
// page when the job has a real parent), each phase's event is its own airy row
// beneath it. Every card carries the quiet rollup line — update count, plus
// dollars posted when there are any — so headers stay uniform across the row
// and the card's weight is legible before reading the rows.
function PropertyCard({ group, onOpen, onOpenProperty }: {
  group: PropertyGroup
  onOpen: (item: WhatsChangedItem) => void
  onOpenProperty: (parent: string) => void
}) {
  const costTotal = group.items.reduce((s, i) => s + (i.kind === "cost" ? (i.amount ?? 0) : 0), 0)
  return (
    <div className="wc-card">
      <div className="wc-card-head">
        {group.parent ? (
          <button
            type="button"
            className="wc-prop"
            onClick={() => onOpenProperty(group.parent!)}
            title="View property"
          >
            <span className="wc-prop-name body-text emphasized">{group.name}</span>
            <ArrowUpRight size={15} className="wc-prop-arrow" aria-hidden="true" />
          </button>
        ) : (
          <span className="wc-prop">
            <span className="wc-prop-name body-text emphasized">{group.name}</span>
          </span>
        )}
        <span className="wc-prop-sub caption1">
          {group.items.length} {group.items.length === 1 ? "update" : "updates"}
          {costTotal !== 0 && <> · {formatMoneyFull(costTotal)} posted</>}
        </span>
      </div>
      <div className="wc-events">
        {group.items.map((item) => (
          <EventRow key={item.id} item={item} group={group} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )
}

/** Uniform placeholder card: every property is assumed to have two phases of
 *  changes, so the loading row reads as one even-height strip. */
function CardSkeleton() {
  return (
    <div className="wc-card" aria-hidden="true">
      <div className="wc-card-head">
        <span className="wc-prop">
          <span className="wc-prop-name body-text emphasized">
            <SkelText ch={14} />
          </span>
        </span>
        <span className="wc-prop-sub caption1">
          <SkelText ch={10} />
        </span>
      </div>
      <div className="wc-events">
        {Array.from({ length: 2 }, (_, i) => (
          <span key={i} className="wc-event">
            <span className="wc-event-label caption1">
              <SkelText ch={6} />
            </span>
            <span className="wc-event-amount title3 emphasized">
              <SkelText ch={7} />
            </span>
            <span className="wc-event-foot caption1">
              <SkelText ch={12} />
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** One rail segment: dot + day label + line, with that day's cards beneath. */
function DayGroup({ dayKey, children }: { dayKey: string; children: ReactNode }) {
  const today = dayKey === localDayKey(new Date())
  return (
    <div className="wc-group">
      <div className="wc-group-when caption1">
        {/* Sticky within the scrolling row: the label rides the left edge
            while its day scrolls past, then the next day pushes it out. */}
        <span className="wc-group-label">
          {/* Copper marks fresh (today's) activity — state, not decoration. */}
          <span className={`wc-dot${today ? " wc-dot--today" : ""}`} aria-hidden="true" />
          <span className="wc-group-day">{dayLabel(dayKey)}</span>
        </span>
      </div>
      <div className="wc-group-cards">{children}</div>
    </div>
  )
}

const COST_TYPE_LABELS: Record<number, string> = {
  1: "Material",
  2: "Labor",
  3: "Equipment",
  4: "Subcontract",
  5: "Other",
}

interface CostLine {
  description: string | null
  vendorName: string | null
  amount: number
  costType: number | null
  enteredAt: string
  recnum: string | null
  /** AP invoice recnum the line was posted from; null = payroll/journal. */
  linkRecnum: string | null
  /** That invoice's grand total; null = payroll/journal (no invoice). */
  invoiceTotal: number | null
}

/** True when the line is one slice of a larger invoice (multi-job split,
 *  tax/retention, or a later cost added onto it) — the invoice modal will
 *  show a bigger number than this row, on purpose. */
function isPartOfLargerInvoice(line: CostLine): boolean {
  return (
    line.linkRecnum != null &&
    line.invoiceTotal != null &&
    Math.abs(line.invoiceTotal - line.amount) >= 0.005
  )
}

// Same drill-down convention as the jobcost Cost Breakdown table: an
// invoice-backed line opens the AP invoice modal, anything else a header-only
// posted-cost card (jobId null on purpose — the ledger fetch describes a
// job × cost-type rollup, not this single posting).
function lineToDrilldownItem(line: CostLine, item: WhatsChangedItem): RecentChangeItem {
  const isInvoice = Boolean(line.linkRecnum)
  return {
    kind: isInvoice ? "apInvoice" : "cost",
    id: isInvoice ? String(line.linkRecnum) : `cost-${line.recnum}`,
    jobId: null,
    jobName: item.jobName,
    title: line.description?.trim() || line.vendorName?.trim() || "Cost line",
    party: line.vendorName,
    amount: line.amount,
    status: null,
    pmName: null,
    enteredBy: null,
    occurredAt: line.enteredAt,
  }
}

/** The individual cost lines behind one job × day batch. The batch id encodes
 *  its calendar day (`jobnum-YYYY-MM-DD`), which becomes the [from, to] window
 *  of a csttyp-less recentCostLines fetch. */
function useCostLines(item: WhatsChangedItem | null) {
  // Lines are stored WITH the batch id they belong to — a stale result for a
  // previously-opened item simply reads as "still loading" for the current
  // one, so no synchronous reset is needed when the item changes.
  const [loaded, setLoaded] = useState<{ id: string; lines: CostLine[] } | null>(null)
  const itemId = item?.kind === "cost" ? item.id : null
  const jobId = item?.jobId

  useEffect(() => {
    if (!itemId || !jobId) return
    const day = itemId.slice(-10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return
    const ctrl = new AbortController()
    fetchPageData({
      module: "dashboard",
      queries: ["recentCostLines"],
      params: { jobnum: Number(jobId), from: day, to: day },
      signal: ctrl.signal,
    })
      .then((d) => setLoaded({ id: itemId, lines: (d.recentCostLines as CostLine[] | null) ?? [] }))
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return
        setLoaded({ id: itemId, lines: [] })
      })
    return () => ctrl.abort()
  }, [itemId, jobId])

  const lines = itemId && loaded?.id === itemId ? loaded.lines : null
  return { lines, loading: itemId !== null && lines === null }
}

/** Expanded view of one timeline card. The project link lives here — the
 *  card itself only expands. */
function ChangeDetailModal({
  item,
  onClose,
  onOpenProject,
  onOpenLine,
}: {
  item: WhatsChangedItem | null
  onClose: () => void
  onOpenProject: (jobId: string) => void
  onOpenLine: (line: CostLine, item: WhatsChangedItem) => void
}) {
  const open = item !== null
  const { overlayZ, contentZ, isTopLayer } = useModalLayer(open)
  const marginColorsOn = useMarginColorsEnabled()
  const marginStyle = (m: number | null) =>
    marginColorsOn && m != null ? { color: marginTextColor(m) } : undefined
  const delta = item ? marginDelta(item) : null
  const { lines, loading: linesLoading } = useCostLines(item)

  return createPortal(
    <AnimatePresence>
      {item && (
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
              className="modal wc-detail-modal scrollbar-secondary"
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="modal-header">
                <h2 className="title2 emphasized">{item.jobName}</h2>
                <button className="button modal-close" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>
              <div className="wc-detail-meta">
                <KindPill item={item} />
                <span className="caption1 wc-detail-when">
                  {formatDate(item.occurredAt)} · {formatRelativeTime(item.occurredAt)}
                </span>
              </div>
              <dl className="wc-detail-grid">
                {item.kind === "cost" ? (
                  <>
                    <div className="wc-detail-fact">
                      <dt className="caption1">Amount</dt>
                      <dd className="title3 emphasized">{formatMoneyFull(item.amount ?? 0)}</dd>
                    </div>
                    <div className="wc-detail-fact">
                      <dt className="caption1">Cost lines</dt>
                      <dd className="title3 emphasized">{item.lineCount ?? "—"}</dd>
                    </div>
                    <div className="wc-detail-fact">
                      <dt className="caption1">Margin</dt>
                      <dd className="title3 emphasized" style={marginStyle(item.marginAfter)}>
                        {item.marginAfter != null ? `${item.marginAfter.toFixed(1)}%` : "—"}
                        {delta != null && <DeltaChip delta={delta} />}
                      </dd>
                    </div>
                  </>
                ) : (
                  <div className="wc-detail-fact">
                    <dt className="caption1">Final margin</dt>
                    <dd className="title3 emphasized" style={marginStyle(item.marginAfter)}>
                      {item.marginAfter != null ? `${item.marginAfter.toFixed(1)}%` : "—"}
                    </dd>
                  </div>
                )}
                {item.pmName && (
                  <div className="wc-detail-fact">
                    <dt className="caption1">Project manager</dt>
                    <dd className="title3 emphasized">{item.pmName}</dd>
                  </div>
                )}
              </dl>
              {/* The way out — the invoice modal's project card, verbatim
                  (.cost-detail-project family; copper is reserved for its
                  arrow on hover). It rides above the lines table so the jump
                  to the report doesn't sink below a long batch. The name line
                  is the action, since the title above already names the
                  project. */}
              <button
                type="button"
                className="cost-detail-project"
                onClick={() => onOpenProject(item.jobId)}
                aria-label={`View project ${item.jobName}`}
              >
                <span className="cost-detail-project-text">
                  <span className="cost-detail-project-eyebrow">Project</span>
                  <span className="cost-detail-project-name">Open project report</span>
                  <span className="cost-detail-project-num">Job #{item.jobId}</span>
                </span>
                <ArrowUpRight size={17} className="cost-detail-project-icon" aria-hidden />
              </button>
              {/* The actual lines in this batch (cost events only). */}
              {item.kind === "cost" && (
                <div className="wc-detail-lines-block">
                  <span className="caption1 wc-detail-lines-title">Costs added</span>
                  {linesLoading || lines === null ? (
                    // The batch's line count is already on the card, so the
                    // skeleton renders the table at its real row count — the
                    // modal doesn't reflow when the lines land.
                    // Same anatomy as a loaded row (name + meta lines, amount,
                    // chevron slot) so nothing shifts when the data lands;
                    // widths vary per row so the list reads as text, not bars.
                    <ul className="wc-detail-lines" aria-hidden="true">
                      {Array.from({ length: item.lineCount ?? 3 }, (_, i) => (
                        <li key={i}>
                          <span className="wc-detail-line">
                            <span className="wc-detail-line-main body-text">
                              <span className="wc-detail-line-name">
                                <SkelText ch={[18, 13, 16][i % 3]} />
                              </span>
                              <span className="wc-detail-line-meta caption1">
                                <SkelText ch={[9, 12, 8][i % 3]} />
                              </span>
                            </span>
                            <span className="wc-detail-line-amount body-text emphasized">
                              <SkelText ch={6} />
                            </span>
                            <ChevronRight
                              size={14}
                              className="wc-detail-line-chevron wc-detail-line-chevron--skel"
                            />
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : lines.length === 0 ? (
                    <p className="wc-detail-lines-empty caption1">Line detail is not available</p>
                  ) : (
                    <ul className="wc-detail-lines">
                      {lines.map((line, i) => (
                        <li key={i}>
                          <button
                            type="button"
                            className="wc-detail-line"
                            onClick={() => onOpenLine(line, item)}
                            title={
                              isPartOfLargerInvoice(line)
                                ? "View full invoice"
                                : line.linkRecnum
                                  ? "View invoice"
                                  : "View posting"
                            }
                          >
                            <span className="wc-detail-line-main body-text">
                              <span className="wc-detail-line-name">
                                {line.description?.trim() || line.vendorName?.trim() || "Cost line"}
                              </span>
                              <span className="wc-detail-line-meta caption1">
                                {COST_TYPE_LABELS[line.costType ?? 0] ?? "Cost"}
                                {line.vendorName?.trim() && line.description?.trim()
                                  ? ` · ${line.vendorName.trim()}`
                                  : ""}
                                {/* Every invoice-backed line states its
                                    relationship to the invoice it opens: one
                                    slice of a bigger one (so the modal's larger
                                    total reads as intentional) or the whole
                                    thing. Payroll/journal lines get no pill. */}
                                {line.linkRecnum != null && line.invoiceTotal != null && (
                                  <span className="wc-line-pill">
                                    {isPartOfLargerInvoice(line)
                                      ? `Added to ${formatMoneyFull(line.invoiceTotal)} invoice`
                                      : "Full invoice"}
                                  </span>
                                )}
                              </span>
                            </span>
                            <span className="wc-detail-line-amount body-text emphasized">
                              {formatMoneyFull(line.amount)}
                            </span>
                            <ChevronRight size={14} className="wc-detail-line-chevron" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

/**
 * The What's Changed timeline: a horizontally scrolling row of property cards
 * (one card per property per day, phases as rows inside), newest at the left,
 * riding a thin rail with one dot + label per calendar day. Scroll snaps to card boundaries (the row never rests
 * half-scrolled); the affordances are a peeking card, a right-edge fade, and
 * chevrons that page by whole cards — back-to-newer appears once the row has
 * been scrolled. Pages of 10 are prefetched ~two card-widths before
 * the end. Clicking a card expands it into a detail modal; the project link
 * lives there.
 */
// The timeline's filter: both event kinds, posted-cost batches only, or
// projects marked Complete/Closed only. Rendered with the shared Job Costing
// segmented control (light-surface variant — this section sits on the page,
// not the command bar's ink deck).
const KIND_OPTIONS: readonly { key: WhatsChangedKind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "cost", label: "Costs" },
  { key: "status", label: "Finished" },
]

const EMPTY_SUB: Record<WhatsChangedKind, string> = {
  all: "New costs and status changes will land here.",
  cost: "New posted costs will land here.",
  status: "Projects marked Complete or Closed will land here.",
}

export function WhatsChangedRow({ queryName }: { queryName: WhatsChangedQuery }) {
  const [kind, setKind] = useState<WhatsChangedKind>("all")
  const { items, hasMore, loadMore, loadingMore, isLoading, unavailable } =
    useWhatsChangedFeed(queryName, kind)
  const { goToJobcost, goToProperty } = useJobcostNav()
  // Second modal layer for the expanded card's line click-through — the same
  // routing the Daily Recap feed and jobcost Cost Breakdown use (AP invoice
  // modal for invoice-backed lines, header-only card otherwise).
  const { openItem, modals: drilldownModals } = useItemDrilldown({ backLabel: "Dashboard" })
  const isMobile = useIsMobile()

  // Consecutive same-day items share one rail segment (the feed arrives
  // newest-first, so consecutive grouping IS day grouping); within a day,
  // same-property events fold into one card. That bends strict event order —
  // a property's older event rides up into its card — but the ordering stays
  // deterministic: days newest-first, properties by their newest event,
  // events within a card newest-first.
  const groups = useMemo(() => {
    const out: { key: string; props: PropertyGroup[] }[] = []
    for (const item of items) {
      const dayKey = dayKeyOf(item.occurredAt)
      let day = out[out.length - 1]
      if (!day || day.key !== dayKey) {
        day = { key: dayKey, props: [] }
        out.push(day)
      }
      const { key, parent } = propertyKeyOf(item)
      const prop = day.props.find((p) => p.key === key)
      if (prop) prop.items.push(item)
      else day.props.push({ key, name: key, parent, items: [item] })
    }
    return out
  }, [items])

  const rowRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [detailItem, setDetailItem] = useState<WhatsChangedItem | null>(null)
  // Fade + chevrons show only while there's content past that edge.
  const [moreRight, setMoreRight] = useState(false)
  const [moreLeft, setMoreLeft] = useState(false)

  const updateEdges = useCallback(() => {
    const el = rowRef.current
    if (!el) return
    setMoreRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8)
    setMoreLeft(el.scrollLeft > 8)
  }, [])

  useEffect(() => {
    updateEdges()
    const el = rowRef.current
    if (!el) return
    el.addEventListener("scroll", updateEdges, { passive: true })
    window.addEventListener("resize", updateEdges)
    return () => {
      el.removeEventListener("scroll", updateEdges)
      window.removeEventListener("resize", updateEdges)
    }
  }, [updateEdges, items.length, isLoading])

  // Keep the rail line clear of the stuck day label. The label is sticky, so
  // while a long day scrolls past it slides rightward over its own segment of
  // the rail line — and it paints NO background (a repaint patch flickered
  // over the app's glow gradient, see .wc-group-label). Instead the line is
  // trimmed from the left by exactly the label's stick offset each scroll
  // frame: --wc-line-trim feeds .wc-group-when::after's margin-left, so the
  // line always starts at the label's right edge, stuck or not.
  const updateLineTrims = useCallback(() => {
    const row = rowRef.current
    if (!row) return
    for (const when of row.querySelectorAll<HTMLElement>(".wc-group-when")) {
      const label = when.querySelector<HTMLElement>(".wc-group-label")
      if (!label) continue
      const shift = label.getBoundingClientRect().left - when.getBoundingClientRect().left
      when.style.setProperty("--wc-line-trim", shift > 0.5 ? `${shift}px` : "0px")
    }
  }, [])

  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0
          updateLineTrims()
        })
      }
    }
    updateLineTrims()
    el.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      el.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [updateLineTrims, items.length, isLoading])

  // Prefetch the next page well before the end of the row is visible.
  useEffect(() => {
    const root = rowRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore()
      },
      { root, rootMargin: "0px 600px 0px 0px" }
    )
    io.observe(sentinel)
    return () => io.disconnect()
  }, [loadMore])

  // Chevron paging is animated by hand (a spring driving scrollLeft through a
  // MotionValue): native smooth scrollTo is a fixed, hurried glide. A spring —
  // not a tween — because paging is interruptible: the MotionValue carries its
  // live velocity into each retarget, so rapid clicks read as one continuous
  // glide that keeps pace, never a restart. The pending target is kept so a
  // second click paces on from where the first is HEADED, not where it
  // currently is.
  const scrollX = useMotionValue(0)
  const scrollAnimRef = useRef<ReturnType<typeof animate> | null>(null)
  const scrollTargetRef = useRef<number | null>(null)

  useEffect(
    () =>
      scrollX.on("change", (v) => {
        const el = rowRef.current
        if (el) el.scrollLeft = v
      }),
    [scrollX]
  )

  const stopPageScroll = useCallback(() => {
    scrollAnimRef.current?.stop()
    scrollAnimRef.current = null
    scrollTargetRef.current = null
  }, [])

  // The spring owns scrollLeft only until the user touches the row. The wheel
  // listener is also the history-swipe guard: NON-passive so a horizontal
  // overscroll at either edge can be eaten before it chains up and triggers
  // the browser's back/forward navigation gesture — overscroll-behavior alone
  // doesn't stop Safari's swipe. Mid-row deltas are never prevented, so
  // normal scrolling stays native.
  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      stopPageScroll()
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      const max = el.scrollWidth - el.clientWidth
      if ((e.deltaX < 0 && el.scrollLeft <= 0) || (e.deltaX > 0 && el.scrollLeft >= max - 1)) {
        e.preventDefault()
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    el.addEventListener("touchstart", stopPageScroll, { passive: true })
    return () => {
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("touchstart", stopPageScroll)
      stopPageScroll()
    }
  }, [stopPageScroll, items.length, isLoading])

  // Shared glide for the chevrons and the return-to-newest button.
  const glideTo = (target: number) => {
    const el = rowRef.current
    if (!el) return
    const pending = scrollTargetRef.current
    if (target === (pending ?? el.scrollLeft)) return
    // Idle start: sync the MotionValue to wherever the row rests. Mid-flight
    // it already holds position AND velocity — jumping here would zero the
    // velocity and turn a rapid second click into a visible restart.
    if (pending === null) scrollX.jump(el.scrollLeft)
    scrollTargetRef.current = target
    scrollAnimRef.current = animate(scrollX, target, {
      // A brisk, settled glide — no overshoot (scrollLeft clamps at the row's
      // edges, so any bounce would visibly flatten there).
      type: "spring",
      visualDuration: 0.5,
      bounce: 0,
      onComplete: stopPageScroll,
    })
  }

  // Advance/retreat by as many WHOLE cards as fit the viewport (measured, not
  // guessed), so the chevrons read as paging: a card always lands flush at
  // the left edge of the next page.
  const scrollByPage = (dir: 1 | -1) => {
    const el = rowRef.current
    if (!el) return
    // Cards keep a uniform pitch (416px + 1rem gap) even across group
    // boundaries — the row gap and in-group gap match on purpose.
    const card = el.querySelector<HTMLElement>(".wc-card")
    const step = card ? card.offsetWidth + 16 : 432
    const cardsPerView = Math.max(1, Math.floor(el.clientWidth / step))
    const base = scrollTargetRef.current ?? el.scrollLeft
    glideTo(
      Math.min(
        el.scrollWidth - el.clientWidth,
        Math.max(0, Math.round((base + dir * cardsPerView * step) / step) * step)
      )
    )
  }

  // Flipping the filter swaps the row's content wholesale — kill any in-flight
  // page glide and rewind to the newest edge so the new feed starts at its
  // start (edge fades/chevrons follow via the scroll listener + items effect).
  const changeKind = (next: WhatsChangedKind) => {
    if (next === kind) return
    stopPageScroll()
    setKind(next)
    const el = rowRef.current
    if (el) el.scrollLeft = 0
  }

  const empty = !isLoading && (unavailable || items.length === 0)

  return (
    <div className="wc-block">
      <div className="wc-head">
        <h3 className="wc-title title3 emphasized">What's Changed</h3>
        <div className="wc-head-controls">
          {/* Return-to-newest: only earns its spot once the row has left the
              start (and it's the only way back on mobile, which has no
              chevrons). Rides the same velocity-carrying glide as paging. */}
          <AnimatePresence>
            {moreLeft && (
              <motion.button
                type="button"
                className="wc-start-btn"
                onClick={() => glideTo(0)}
                aria-label="Back to the latest changes"
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                <ArrowLeftToLine size={14} aria-hidden="true" />
                Latest
              </motion.button>
            )}
          </AnimatePresence>
          <SegmentedControl
            value={kind}
            options={KIND_OPTIONS}
            onChange={changeKind}
            layoutId="wcKindSeg"
            variant="ohr"
            role="group"
            ariaLabel="Filter changes by kind"
          />
        </div>
      </div>
      {empty ? (
        // Ghost timeline: the rail and card slots the feed would fill, drawn
        // as dashed placeholders, with the message riding in the first slot.
        // Distinct copy for the null case (backend without the query, missing
        // claim, or SQL disconnect) so it can't masquerade as a quiet feed.
        <div className="wc-empty" role="status">
          <div className="wc-group-when caption1" aria-hidden="true">
            <span className="wc-group-label">
              <span className="wc-dot" />
              <span className="wc-group-day">Today</span>
            </span>
          </div>
          <div className="wc-empty-slots">
            <div className={`wc-empty-msg${unavailable ? " wc-empty-msg--unavailable" : ""}`}>
              <span className="wc-empty-msg-head body-text emphasized">
                {unavailable ? (
                  <CloudOff size={17} aria-hidden="true" />
                ) : (
                  <CircleCheck size={17} aria-hidden="true" />
                )}
                {unavailable ? "The feed is unavailable" : "You're all caught up"}
              </span>
              <span className="wc-empty-msg-sub caption1">
                {unavailable ? "Project changes can't be loaded right now." : EMPTY_SUB[kind]}
              </span>
            </div>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="wc-empty-slot" aria-hidden="true" />
            ))}
          </div>
        </div>
      ) : (
        <div className="wc-scroller">
          <div className={`wc-row${moreRight ? " wc-row--more" : ""}`} ref={rowRef}>
            {isLoading ? (
              // Enough skeleton cards to fill any viewport edge-to-edge (the
              // row clips the excess), so the loading state mirrors the
              // loaded layout instead of stopping short mid-screen.
              <div className="wc-group" aria-hidden="true">
                <div className="wc-group-when caption1">
                  <span className="wc-group-label">
                    <span className="wc-dot" />
                    <SkelText ch={5} />
                  </span>
                </div>
                <div className="wc-group-cards">
                  {Array.from({ length: 8 }, (_, i) => (
                    <CardSkeleton key={i} />
                  ))}
                </div>
              </div>
            ) : (
              groups.map((group) => (
                // Keyed by first item, not day — pagination can in principle
                // split a day into two consecutive groups, and duplicate keys
                // make React mis-reconcile the row.
                <DayGroup key={group.props[0].items[0].id} dayKey={group.key}>
                  {group.props.map((prop) => (
                    <PropertyCard
                      key={prop.items[0].id}
                      group={prop}
                      onOpen={setDetailItem}
                      onOpenProperty={goToProperty}
                    />
                  ))}
                </DayGroup>
              ))
            )}
            {loadingMore && (
              <div className="wc-group" aria-hidden="true">
                <div className="wc-group-when caption1">
                  <span className="wc-group-label">
                    <span className="wc-dot" />
                    <SkelText ch={5} />
                  </span>
                </div>
                <div className="wc-group-cards">
                  {[0, 1].map((i) => (
                    <CardSkeleton key={`more-${i}`} />
                  ))}
                </div>
              </div>
            )}
            {/* Sentinel sits after the last card; observed against the row with
                a generous right rootMargin so the next page is already in
                flight before the user can reach the end. */}
            {!isLoading && hasMore && <div className="wc-sentinel" ref={sentinelRef} aria-hidden="true" />}
          </div>
          {!isMobile && !isLoading && moreLeft && (
            <button
              type="button"
              className="wc-more-btn wc-more-btn--left"
              onClick={() => scrollByPage(-1)}
              aria-label="Show newer changes"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          {!isMobile && !isLoading && moreRight && (
            <button
              type="button"
              className="wc-more-btn"
              onClick={() => scrollByPage(1)}
              aria-label="Show older changes"
            >
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      )}
      <ChangeDetailModal
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onOpenProject={(jobId) => {
          setDetailItem(null)
          goToJobcost(jobId)
        }}
        onOpenLine={(line, item) => openItem(lineToDrilldownItem(line, item))}
      />
      {drilldownModals}
    </div>
  )
}
