import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronRight, X } from "lucide-react"
import { useJobcostNav } from "../../jobcost/useJobcostNav"
import useIsMobile from "../../../shared/hooks/useIsMobile"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import { useModalLayer } from "../../../shared/hooks/useModalLayer"
import { SkelText } from "../../../shared/components/SkelText"
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
  type WhatsChangedQuery,
} from "./useWhatsChangedFeed"

// Is the event from today (wall-clock date part)? Today's rail dots get the
// copper accent — state (fresh activity), not decoration.
function isToday(occurredAt: string): boolean {
  const m = occurredAt.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return false
  const now = new Date()
  return +m[1] === now.getFullYear() && +m[2] === now.getMonth() + 1 && +m[3] === now.getDate()
}

function marginDelta(item: WhatsChangedItem): number | null {
  if (item.kind !== "cost" || item.marginBefore == null || item.marginAfter == null) return null
  const delta = item.marginAfter - item.marginBefore
  // A cost batch normally lowers margin; a credit batch raises it. Only a
  // meaningful move is worth showing.
  return Math.abs(delta) >= 0.05 ? delta : null
}

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

function ChangeCard({ item, onOpen }: { item: WhatsChangedItem; onOpen: (item: WhatsChangedItem) => void }) {
  const marginColorsOn = useMarginColorsEnabled()
  const marginStyle = (m: number | null) =>
    marginColorsOn && m != null ? { color: marginTextColor(m) } : undefined
  const delta = marginDelta(item)

  return (
    <div className="wc-item">
      <div className="wc-item-when caption1">
        <span className={`wc-dot${isToday(item.occurredAt) ? " wc-dot--today" : ""}`} aria-hidden="true" />
        <span>{formatRelativeTime(item.occurredAt)}</span>
      </div>
      <button type="button" className="wc-card" onClick={() => onOpen(item)} title="View details">
        <div className="wc-card-top">
          <KindPill item={item} />
        </div>
        <span className="wc-card-name body-text emphasized">{item.jobName}</span>
        {item.kind === "cost" ? (
          <div className="wc-card-lines">
            <span className="wc-card-amount subheadline emphasized">
              {formatMoneyFull(item.amount ?? 0)}
              {item.lineCount != null && (
                <span className="wc-card-count caption1">
                  {" "}
                  · {item.lineCount} {item.lineCount === 1 ? "line" : "lines"}
                </span>
              )}
            </span>
            {item.marginAfter != null && (
              <span className="wc-card-margin caption1">
                Margin{" "}
                <span className="emphasized" style={marginStyle(item.marginAfter)}>
                  {item.marginAfter.toFixed(1)}%
                </span>
                {delta != null && <DeltaChip delta={delta} />}
              </span>
            )}
          </div>
        ) : (
          <div className="wc-card-lines">
            {item.marginAfter != null && (
              <span className="wc-card-margin caption1">
                Final margin{" "}
                <span className="emphasized" style={marginStyle(item.marginAfter)}>
                  {item.marginAfter.toFixed(1)}%
                </span>
              </span>
            )}
          </div>
        )}
      </button>
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="wc-item" aria-hidden="true">
      <div className="wc-item-when caption1">
        <span className="wc-dot" />
        <SkelText ch={6} />
      </div>
      <div className="wc-card wc-card--skel">
        <div className="wc-card-top">
          <span className="wc-pill wc-pill--skel">
            <SkelText ch={8} />
          </span>
        </div>
        <span className="wc-card-name body-text emphasized">
          <SkelText ch={16} />
        </span>
        <div className="wc-card-lines">
          <span className="wc-card-amount subheadline emphasized">
            <SkelText ch={10} />
          </span>
          <span className="wc-card-margin caption1">
            <SkelText ch={12} />
          </span>
        </div>
      </div>
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
              className="modal wc-detail-modal"
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
                      <dt className="caption1">Costs entered</dt>
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
              {/* The actual lines in this batch (cost events only). */}
              {item.kind === "cost" && (
                <div className="wc-detail-lines-block">
                  <span className="caption1 wc-detail-lines-title">Lines added</span>
                  {linesLoading || lines === null ? (
                    <ul className="wc-detail-lines" aria-hidden="true">
                      {[0, 1, 2].map((i) => (
                        <li key={i}>
                          <span className="wc-detail-line">
                            <span className="wc-detail-line-main body-text">
                              <SkelText ch={18} />
                            </span>
                            <span className="wc-detail-line-amount body-text emphasized">
                              <SkelText ch={6} />
                            </span>
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
                            title={line.linkRecnum ? "View invoice" : "View posting"}
                          >
                            <span className="wc-detail-line-main body-text">
                              {line.description?.trim() || line.vendorName?.trim() || "Cost line"}
                              <span className="wc-detail-line-meta caption1">
                                {COST_TYPE_LABELS[line.costType ?? 0] ?? "Cost"}
                                {line.vendorName?.trim() && line.description?.trim()
                                  ? ` · ${line.vendorName.trim()}`
                                  : ""}
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
              <button
                type="button"
                className="button wc-detail-open-btn"
                onClick={() => onOpenProject(item.jobId)}
              >
                Open project report
                <ChevronRight size={16} />
              </button>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

/**
 * The What's Changed timeline: a horizontally scrolling row of project-change
 * cards, newest at the left, riding a thin rail with a dot per event. Free
 * momentum scroll (no snap — trackpads hate fighting it); the affordances are
 * a peeking card, a right-edge fade, and a chevron that pages by whole cards.
 * Pages of 10 are prefetched ~two card-widths before the end. Clicking a card
 * expands it into a detail modal; the project link lives there.
 */
export function WhatsChangedRow({ queryName }: { queryName: WhatsChangedQuery }) {
  const { items, hasMore, loadMore, loadingMore, isLoading, unavailable } =
    useWhatsChangedFeed(queryName)
  const { goToJobcost } = useJobcostNav()
  // Second modal layer for the expanded card's line click-through — the same
  // routing the Daily Recap feed and jobcost Cost Breakdown use (AP invoice
  // modal for invoice-backed lines, header-only card otherwise).
  const { openItem, modals: drilldownModals } = useItemDrilldown({ backLabel: "Dashboard" })
  const isMobile = useIsMobile()

  const rowRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [detailItem, setDetailItem] = useState<WhatsChangedItem | null>(null)
  // Fade + chevron show only while there's content past the right edge.
  const [moreRight, setMoreRight] = useState(false)

  const updateEdges = useCallback(() => {
    const el = rowRef.current
    if (!el) return
    setMoreRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8)
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

  // Advance by as many WHOLE cards as fit the viewport (measured, not
  // guessed), so the chevron reads as paging: the first partially-visible
  // card lands flush at the left edge of the next page.
  const scrollByPage = () => {
    const el = rowRef.current
    if (!el) return
    const item = el.querySelector<HTMLElement>(".wc-item")
    const step = item ? item.offsetWidth + 16 : 316
    const cardsPerView = Math.max(1, Math.floor(el.clientWidth / step))
    const target = Math.round((el.scrollLeft + cardsPerView * step) / step) * step
    el.scrollTo({ left: target, behavior: "smooth" })
  }

  const empty = !isLoading && (unavailable || items.length === 0)

  return (
    <div className="wc-block">
      <h3 className="wc-title title3 emphasized">What's Changed</h3>
      {empty ? (
        // Distinct copy for the null case (backend without the query, missing
        // claim, or SQL disconnect) so it can't masquerade as a quiet feed.
        <p className="wc-empty subheadline">
          {unavailable
            ? "The change feed is not available right now"
            : "Nothing new on your projects yet"}
        </p>
      ) : (
        <div className="wc-scroller">
          <div className={`wc-row${moreRight ? " wc-row--more" : ""}`} ref={rowRef}>
            {isLoading
              ? [0, 1, 2].map((i) => <CardSkeleton key={i} />)
              : items.map((item) => <ChangeCard key={item.id} item={item} onOpen={setDetailItem} />)}
            {loadingMore && [0, 1].map((i) => <CardSkeleton key={`more-${i}`} />)}
            {/* Sentinel sits after the last card; observed against the row with
                a generous right rootMargin so the next page is already in
                flight before the user can reach the end. */}
            {!isLoading && hasMore && <div className="wc-sentinel" ref={sentinelRef} aria-hidden="true" />}
          </div>
          {!isMobile && moreRight && (
            <button
              type="button"
              className="wc-more-btn"
              onClick={scrollByPage}
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
