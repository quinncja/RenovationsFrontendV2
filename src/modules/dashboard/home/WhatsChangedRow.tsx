import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronRight } from "lucide-react"
import { useJobcostNav } from "../../jobcost/useJobcostNav"
import useIsMobile from "../../../shared/hooks/useIsMobile"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import { SkelText } from "../../../shared/components/SkelText"
import { formatMoneyFull, formatRelativeTime, marginTextColor } from "../../../shared/utils/format"
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

function ChangeCard({ item, onOpen }: { item: WhatsChangedItem; onOpen: (jobId: string) => void }) {
  const marginColorsOn = useMarginColorsEnabled()
  const marginStyle = (m: number | null) =>
    marginColorsOn && m != null ? { color: marginTextColor(m) } : undefined

  const delta =
    item.kind === "cost" && item.marginBefore != null && item.marginAfter != null
      ? item.marginAfter - item.marginBefore
      : null
  // A cost batch normally lowers margin; a credit batch raises it. Only a
  // meaningful move gets the delta chip.
  const showDelta = delta != null && Math.abs(delta) >= 0.05

  return (
    <div className="wc-item">
      <div className="wc-item-when caption1">
        <span className={`wc-dot${isToday(item.occurredAt) ? " wc-dot--today" : ""}`} aria-hidden="true" />
        <span>{formatRelativeTime(item.occurredAt)}</span>
      </div>
      <button type="button" className="wc-card" onClick={() => onOpen(item.jobId)} title="Open full report">
        <div className="wc-card-top">
          {item.kind === "status" ? (
            <span className={`status-badge status-${item.newStatus}`}>
              {STATUS_LABELS[item.newStatus ?? 0] ?? "Updated"}
            </span>
          ) : (
            <span className="wc-pill">Costs posted</span>
          )}
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
                {showDelta && (
                  <span className={`wc-delta${delta < 0 ? " wc-delta--down" : " wc-delta--up"}`}>
                    {delta > 0 ? "+" : "−"}
                    {Math.abs(delta).toFixed(1)} pts
                  </span>
                )}
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

/**
 * The What's Changed timeline: a horizontally scrolling row of project-change
 * cards, newest at the left. A thin rail + dots give it the timeline read; a
 * right-edge fade plus a floating chevron say "there's more" until the end.
 * Pages of 10 are prefetched ~two card-widths before the user reaches the end
 * (IntersectionObserver sentinel inside the scroll container), so scrolling
 * never hits a visible buffer.
 */
export function WhatsChangedRow({ queryName }: { queryName: WhatsChangedQuery }) {
  const { items, hasMore, loadMore, loadingMore, isLoading, unavailable } =
    useWhatsChangedFeed(queryName)
  const { goToJobcost } = useJobcostNav()
  const isMobile = useIsMobile()

  const rowRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
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

  const scrollByPage = () => {
    const el = rowRef.current
    if (!el) return
    el.scrollBy({ left: el.clientWidth * 0.8, behavior: "smooth" })
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
              : items.map((item) => <ChangeCard key={item.id} item={item} onOpen={goToJobcost} />)}
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
    </div>
  )
}
