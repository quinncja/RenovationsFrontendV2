import { MousePointerClick, Eye, Users, LayoutGrid } from "lucide-react"
import type { WidgetEngagement, PageEngagement } from "./engagementApi"
import { widgetLabel, sectionLabel, pageLabel, formatDuration } from "./labels"

// Ranked horizontal-bar lists for engagement insights. The bar length encodes
// the primary metric (dwell time for widgets, visits for pages); the leaders
// carry a copper rank medallion so the eye lands on what matters first.

// Rank medallion — copper-filled for #1, graduated tint for #2/#3, plain for the
// long tail. This is the one place copper earns its keep: it marks the leader.
function Rank({ n }: { n: number }) {
  const tier = n <= 3 ? n : "rest"
  return <span className={`eng-rank eng-rank--${tier}`}>{n}</span>
}

function MetricBar({ ratio }: { ratio: number }) {
  return (
    <div className="eng-bar-track">
      <div className="eng-bar-fill" style={{ width: `${Math.max(3, ratio * 100)}%` }} />
    </div>
  )
}

export function WidgetEngagementList({
  widgets,
  showUsers = false,
  emptyHint = "No widget engagement yet.",
}: {
  widgets: WidgetEngagement[]
  showUsers?: boolean
  emptyHint?: string
}) {
  if (!widgets.length) return <p className="eng-empty">{emptyHint}</p>
  const max = Math.max(...widgets.map((w) => w.totalDwellMs), 1)

  return (
    <div className="eng-list">
      {widgets.map((w, i) => {
        const section = sectionLabel(w.section)
        return (
          <div className="eng-row" key={`${w.widgetId}-${w.section ?? ""}`}>
            <Rank n={i + 1} />
            <div className="eng-row-main">
              <div className="eng-row-head">
                <div className="eng-row-titles">
                  <span className="eng-row-label">{widgetLabel(w.widgetId)}</span>
                  {section && <span className="eng-row-section">{section}</span>}
                </div>
                <span className="eng-row-metric">{formatDuration(w.totalDwellMs)}</span>
              </div>
              <MetricBar ratio={w.totalDwellMs / max} />
              <div className="eng-row-sub">
                <span className="eng-chip"><Eye size={11} />{w.hoverCount} {w.hoverCount === 1 ? "hover" : "hovers"}</span>
                {w.clickCount > 0 && (
                  <span className="eng-chip"><MousePointerClick size={11} />{w.clickCount} clicks</span>
                )}
                {showUsers && w.userCount != null && (
                  <span className="eng-chip eng-chip--users"><Users size={11} />{w.userCount} {w.userCount === 1 ? "user" : "users"}</span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface SectionAgg {
  section: string
  label: string
  totalDwellMs: number
  hoverCount: number
  clickCount: number
  widgetCount: number
}

// Roll per-widget rows up into per-section totals, ranked by dwell. Widget-level
// user-reach can't be summed into a section without double-counting, so the
// section view drops the "users" chip and shows widget count instead.
function aggregateBySection(widgets: WidgetEngagement[]): SectionAgg[] {
  const map = new Map<string, SectionAgg>()
  for (const w of widgets) {
    const key = w.section ?? "__none__"
    let agg = map.get(key)
    if (!agg) {
      agg = {
        section: key,
        label: w.section ? sectionLabel(w.section) : "Other",
        totalDwellMs: 0, hoverCount: 0, clickCount: 0, widgetCount: 0,
      }
      map.set(key, agg)
    }
    agg.totalDwellMs += w.totalDwellMs
    agg.hoverCount += w.hoverCount
    agg.clickCount += w.clickCount
    agg.widgetCount += 1
  }
  return Array.from(map.values()).sort((a, b) => b.totalDwellMs - a.totalDwellMs)
}

export function SectionEngagementList({
  widgets,
  emptyHint = "No section engagement yet.",
}: {
  widgets: WidgetEngagement[]
  emptyHint?: string
}) {
  const sections = aggregateBySection(widgets)
  if (!sections.length) return <p className="eng-empty">{emptyHint}</p>
  const max = Math.max(...sections.map((s) => s.totalDwellMs), 1)

  return (
    <div className="eng-list">
      {sections.map((s, i) => (
        <div className="eng-row" key={s.section}>
          <Rank n={i + 1} />
          <div className="eng-row-main">
            <div className="eng-row-head">
              <div className="eng-row-titles">
                <span className="eng-row-label">{s.label}</span>
              </div>
              <span className="eng-row-metric">{formatDuration(s.totalDwellMs)}</span>
            </div>
            <MetricBar ratio={s.totalDwellMs / max} />
            <div className="eng-row-sub">
              <span className="eng-chip"><Eye size={11} />{s.hoverCount} {s.hoverCount === 1 ? "hover" : "hovers"}</span>
              {s.clickCount > 0 && (
                <span className="eng-chip"><MousePointerClick size={11} />{s.clickCount} clicks</span>
              )}
              <span className="eng-chip eng-chip--users"><LayoutGrid size={11} />{s.widgetCount} {s.widgetCount === 1 ? "widget" : "widgets"}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function PageEngagementList({
  pages,
  showUsers = false,
  emptyHint = "No page visits yet.",
}: {
  pages: PageEngagement[]
  showUsers?: boolean
  emptyHint?: string
}) {
  if (!pages.length) return <p className="eng-empty">{emptyHint}</p>
  const max = Math.max(...pages.map((p) => p.visits), 1)

  return (
    <div className="eng-list">
      {pages.map((p, i) => (
        <div className="eng-row" key={p.page}>
          <Rank n={i + 1} />
          <div className="eng-row-main">
            <div className="eng-row-head">
              <div className="eng-row-titles">
                <span className="eng-row-label">{pageLabel(p.page)}</span>
              </div>
              <span className="eng-row-metric">{p.visits.toLocaleString()}<span className="eng-row-metric-unit"> visits</span></span>
            </div>
            <MetricBar ratio={p.visits / max} />
            {showUsers && p.userCount != null && (
              <div className="eng-row-sub">
                <span className="eng-chip eng-chip--users"><Users size={11} />{p.userCount} {p.userCount === 1 ? "user" : "users"}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
