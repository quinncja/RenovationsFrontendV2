import { useMemo, useState } from "react"
import type { RecentChangeItem } from "../widgets/recent/recentTypes"
import type { ReportSummary } from "./reportTypes"
import { visibleMetrics } from "./metricDefs"
import { dayLabel } from "./chicagoDate"
import { ActivityFeedRows } from "./ActivityFeed"

/**
 * The Activity page's play-by-play: one chronological stream of everything that
 * happened in the window (newest first), narrowable by category. It complements
 * the metric tiles above rather than repeating them — the tiles are the tally,
 * this is the story.
 *
 * Filter chips share the tiles' category vocabulary (visibleMetrics), so a chip
 * lines up with its tile; "All" additionally surfaces items no tile covers (e.g.
 * change orders), which the old per-metric feed silently dropped. Multi-day
 * windows group the stream under day headers; a single day is one flat list.
 */
export function ActivityTimeline({
  items,
  summary,
  grouped,
  onSelect,
}: {
  items: RecentChangeItem[]
  summary: ReportSummary
  /** Group rows under day headers — on for multi-day windows. */
  grouped: boolean
  onSelect: (item: RecentChangeItem) => void
}) {
  const cats = useMemo(() => visibleMetrics(summary), [summary])
  // Active filter — a metric key, or null for "All".
  const [active, setActive] = useState<string | null>(null)

  const activeDef = cats.find((c) => c.key === active)
  const shown = activeDef ? items.filter((i) => activeDef.kinds.includes(i.kind)) : items

  // Day buckets keyed by the item's Chicago date (occurredAt is naive Chicago
  // wall-clock), newest day first. Items already arrive newest-first, so pushing
  // in order preserves the within-day order too.
  const days = useMemo(() => {
    if (!grouped) return null
    const map = new Map<string, RecentChangeItem[]>()
    for (const it of shown) {
      const ymd = it.occurredAt.slice(0, 10)
      const bucket = map.get(ymd)
      if (bucket) bucket.push(it)
      else map.set(ymd, [it])
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [shown, grouped])

  return (
    <div className="rpt-timeline">
      <div className="rpt-timeline-filter" role="radiogroup" aria-label="Filter activity">
        <button
          type="button"
          className={`rcnt-chip${active === null ? " rcnt-chip--active" : ""}`}
          role="radio"
          aria-checked={active === null}
          onClick={() => setActive(null)}
        >
          All <span className="rpt-chip-count">{items.length}</span>
        </button>
        {cats.map((def) => {
          const n = items.filter((i) => def.kinds.includes(i.kind)).length
          if (n === 0) return null
          const on = active === def.key
          return (
            <button
              key={def.key}
              type="button"
              className={`rcnt-chip${on ? " rcnt-chip--active" : ""}`}
              role="radio"
              aria-checked={on}
              // Click the active chip again to clear back to All.
              onClick={() => setActive(on ? null : def.key)}
            >
              {def.label} <span className="rpt-chip-count">{n}</span>
            </button>
          )
        })}
      </div>

      {shown.length === 0 ? (
        <div className="widget-no-data rpt-timeline-empty">
          <span className="body-text">Nothing here for this filter</span>
        </div>
      ) : days ? (
        <div className="rpt-feed-groups">
          {days.map(([ymd, dayItems]) => (
            <section key={ymd} className="rcnt-group">
              <header className="rcnt-group-head rpt-tl-day">
                <span>{dayLabel(ymd)}</span>
                <span className="rcnt-group-total">
                  {dayItems.length} {dayItems.length === 1 ? "item" : "items"}
                </span>
              </header>
              <ActivityFeedRows items={dayItems} onSelect={onSelect} />
            </section>
          ))}
        </div>
      ) : (
        <ActivityFeedRows items={shown} onSelect={onSelect} />
      )}
    </div>
  )
}
