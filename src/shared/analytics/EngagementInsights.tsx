import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import type { WidgetEngagement, PageEngagement, ProjectEngagement } from "./engagementApi"
import { widgetLabel, sectionLabel, pageLabel, formatDuration } from "./labels"
import { useModalLayer } from "../hooks/useModalLayer"

// Ranked horizontal-bar lists for engagement insights. The bar length encodes
// the primary metric (dwell time for widgets/sections, visits for pages, views
// for projects); the leaders carry a copper rank medallion so the eye lands on
// what matters first. Each row shows its headline count, and a hover/focus
// tooltip reveals the full breakdown.
//
// Cards show only the top N; a "See all" button opens a dedicated scrollable
// modal with the complete list, so the card itself never grows tall enough to
// scroll its pager section.

const TOP_N = 10

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

// Short "Jun 28" style date; undefined for missing/invalid input so callers can
// omit the line entirely.
function fmtDate(iso?: string): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  if (isNaN(d.getTime())) return undefined
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

interface TipRow {
  label: string
  value: string | number
}

// Shared hover/focus tooltip: the item's `title`, a headline `note`, a set of
// label/value rows, and an optional muted `footer` (e.g. "Last opened Jun 28").
function EngTooltip({ title, note, rows, footer }: { title: string; note?: string; rows?: TipRow[]; footer?: string }) {
  return (
    <div className="eng-tip" role="tooltip">
      <div className="eng-tip-title">{title}</div>
      {note && <div className="eng-tip-note">{note}</div>}
      {rows && rows.length > 0 && (
        <div className="eng-tip-rows">
          {rows.map((r) => (
            <div className="eng-tip-row" key={r.label}>
              <span className="eng-tip-label">{r.label}</span>
              <span className="eng-tip-value">{typeof r.value === "number" ? r.value.toLocaleString() : r.value}</span>
            </div>
          ))}
        </div>
      )}
      {footer && <div className="eng-tip-foot">{footer}</div>}
    </div>
  )
}

// One ranked row: rank + name (+ optional sub-label) + headline count + magnitude
// bar, with a tooltip revealing the full detail on hover/focus.
function EngBarRow({
  n,
  label,
  sublabel,
  wrap = false,
  metric,
  ratio,
  tip,
}: {
  n: number
  label: string
  sublabel?: string | null
  wrap?: boolean
  metric: ReactNode
  ratio: number
  tip: ReactNode
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  // The tooltip tracks the cursor horizontally only — its Y stays locked to a
  // sensible spot just below the row (set in CSS) so it never jumps vertically or
  // gets clipped by the scrolling list. Clamp X so a wide tip near the right edge
  // stays inside the row. Keyboard focus never fires this; --tip-x stays unset and
  // the CSS falls back to a fixed left offset.
  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const row = rowRef.current
    if (!row) return
    const rect = row.getBoundingClientRect()
    const tipW = tipRef.current?.offsetWidth ?? 0
    const maxX = rect.width - tipW - 4
    const x = Math.min(Math.max(e.clientX - rect.left + 14, 0), Math.max(0, maxX))
    row.style.setProperty("--tip-x", `${x}px`)
  }

  return (
    <div ref={rowRef} className="eng-row eng-row--hover" tabIndex={0} onMouseMove={handleMove}>
      <Rank n={n} />
      <div className="eng-row-main">
        <div className="eng-row-head">
          <div className="eng-row-titles">
            <span className={`eng-row-label${wrap ? " eng-row-label--wrap" : ""}`} title={label}>{label}</span>
            {sublabel && <span className="eng-row-section">{sublabel}</span>}
          </div>
          <span className="eng-row-metric">{metric}</span>
        </div>
        <MetricBar ratio={ratio} />
      </div>
      <div ref={tipRef} className="eng-tip-follow">{tip}</div>
    </div>
  )
}

// The full-list overlay opened by "See all" — a second, scrollable modal layered
// above the engagement modal. Closing it returns to the card view untouched.
function EngListModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle: string
  onClose: () => void
  children: ReactNode
}) {
  // Mounted only while open, so it always claims the next stacking layer above
  // the engagement modal it was opened from.
  const { overlayZ, contentZ } = useModalLayer(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return createPortal(
    <>
      <div className="modal-overlay eng-seeall-overlay" style={{ zIndex: overlayZ }} onClick={onClose} />
      <div className="modal-positioner eng-seeall-positioner" style={{ zIndex: contentZ }}>
        <div className="modal eng-seeall-modal" role="dialog" aria-label={title}>
          <header className="eng-seeall-head">
            <div className="eng-seeall-titles">
              <h3 className="eng-seeall-title">{title}</h3>
              <span className="ceng-col-sub">{subtitle}</span>
            </div>
            <button className="button modal-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </header>
          <div className="eng-seeall-body">{children}</div>
        </div>
      </div>
    </>,
    document.body,
  )
}

// A ranked-list card: header (title + "See all"/subtitle), the top-N rows, and
// the "see all" modal. `children(limit)` renders the list to a row cap — called
// with TOP_N for the card and Infinity for the modal.
function EngListCard({
  title,
  subtitle,
  total,
  children,
}: {
  title: string
  subtitle: string
  total: number
  children: (limit: number) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const canExpand = total > TOP_N

  return (
    <section className="ceng-col">
      <header className="ceng-col-head">
        <h3 className="ceng-col-title">{title}</h3>
        {canExpand ? (
          <button type="button" className="ceng-see-all" onClick={() => setOpen(true)}>
            See all {total.toLocaleString()}
          </button>
        ) : (
          <span className="ceng-col-sub">{subtitle}</span>
        )}
      </header>
      {children(TOP_N)}
      {open && (
        <EngListModal title={title} subtitle={subtitle} onClose={() => setOpen(false)}>
          {children(Infinity)}
        </EngListModal>
      )}
    </section>
  )
}

export function WidgetEngagementList({
  widgets,
  title,
  subtitle,
  showUsers = false,
  emptyHint = "No widget engagement yet.",
}: {
  widgets: WidgetEngagement[]
  title: string
  subtitle: string
  showUsers?: boolean
  emptyHint?: string
}) {
  const max = Math.max(...widgets.map((w) => w.totalDwellMs), 1)

  return (
    <EngListCard title={title} subtitle={subtitle} total={widgets.length}>
      {(limit) =>
        widgets.length === 0 ? (
          <p className="eng-empty">{emptyHint}</p>
        ) : (
          <div className="eng-list">
            {widgets.slice(0, limit).map((w, i) => {
              const rows: TipRow[] = [
                { label: "Hovers", value: w.hoverCount },
                { label: "Avg. dwell", value: formatDuration(w.avgDwellMs) },
              ]
              if (w.clickCount > 0) rows.push({ label: "Clicks", value: w.clickCount })
              if (w.tooltipCount > 0) rows.push({ label: "Tooltips", value: w.tooltipCount })
              if (showUsers && w.userCount != null) rows.push({ label: "Distinct users", value: w.userCount })
              return (
                <EngBarRow
                  key={`${w.widgetId}-${w.section ?? ""}`}
                  n={i + 1}
                  label={widgetLabel(w.widgetId)}
                  metric={formatDuration(w.totalDwellMs)}
                  ratio={w.totalDwellMs / max}
                  tip={<EngTooltip title={widgetLabel(w.widgetId)} note={`${formatDuration(w.totalDwellMs)} of focus`} rows={rows} />}
                />
              )
            })}
          </div>
        )
      }
    </EngListCard>
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
// section view reports widget count instead.
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
  title,
  subtitle,
  emptyHint = "No section engagement yet.",
}: {
  widgets: WidgetEngagement[]
  title: string
  subtitle: string
  emptyHint?: string
}) {
  const sections = aggregateBySection(widgets)
  const max = Math.max(...sections.map((s) => s.totalDwellMs), 1)

  return (
    <EngListCard title={title} subtitle={subtitle} total={sections.length}>
      {(limit) =>
        sections.length === 0 ? (
          <p className="eng-empty">{emptyHint}</p>
        ) : (
          <div className="eng-list">
            {sections.slice(0, limit).map((s, i) => {
              const rows: TipRow[] = [{ label: "Hovers", value: s.hoverCount }]
              if (s.clickCount > 0) rows.push({ label: "Clicks", value: s.clickCount })
              rows.push({ label: "Widgets used", value: s.widgetCount })
              return (
                <EngBarRow
                  key={s.section}
                  n={i + 1}
                  label={s.label}
                  metric={formatDuration(s.totalDwellMs)}
                  ratio={s.totalDwellMs / max}
                  tip={<EngTooltip title={s.label} note={`${formatDuration(s.totalDwellMs)} of focus`} rows={rows} />}
                />
              )
            })}
          </div>
        )
      }
    </EngListCard>
  )
}

export function ProjectEngagementList({
  projects,
  title,
  subtitle,
  showUsers = false,
  emptyHint = "No projects viewed yet.",
}: {
  projects: ProjectEngagement[]
  title: string
  subtitle: string
  showUsers?: boolean
  emptyHint?: string
}) {
  const max = Math.max(...projects.map((p) => p.views), 1)

  return (
    <EngListCard title={title} subtitle={subtitle} total={projects.length}>
      {(limit) =>
        projects.length === 0 ? (
          <p className="eng-empty">{emptyHint}</p>
        ) : (
          <div className="eng-list">
            {projects.slice(0, limit).map((p, i) => {
              const name = p.name?.trim() || `Job #${p.recnum}`
              const pageViews = p.pageViews ?? 0
              const widgetViews = p.widgetViews ?? 0
              // Richer breakdown: total opens, then how they split between a full
              // job-detail page and a quick inline expand from the Job Costing table.
              const rows: TipRow[] = [
                { label: "Opened the full page", value: pageViews },
                { label: "Quick look from table", value: widgetViews },
              ]
              if (showUsers && p.userCount != null) rows.push({ label: "Distinct users", value: p.userCount })
              const last = fmtDate(p.lastViewed)
              return (
                <EngBarRow
                  key={p.recnum}
                  n={i + 1}
                  label={name}
                  wrap
                  metric={<>{p.views.toLocaleString()}<span className="eng-row-metric-unit"> views</span></>}
                  ratio={p.views / max}
                  tip={
                    <EngTooltip
                      title={name}
                      note={`Opened ${p.views.toLocaleString()} ${p.views === 1 ? "time" : "times"} · last 30 days`}
                      rows={rows}
                      footer={last ? `Last opened ${last}` : undefined}
                    />
                  }
                />
              )
            })}
          </div>
        )
      }
    </EngListCard>
  )
}

export function PageEngagementList({
  pages,
  title,
  subtitle,
  showUsers = false,
  emptyHint = "No page visits yet.",
}: {
  pages: PageEngagement[]
  title: string
  subtitle: string
  showUsers?: boolean
  emptyHint?: string
}) {
  const max = Math.max(...pages.map((p) => p.visits), 1)

  return (
    <EngListCard title={title} subtitle={subtitle} total={pages.length}>
      {(limit) =>
        pages.length === 0 ? (
          <p className="eng-empty">{emptyHint}</p>
        ) : (
          <div className="eng-list">
            {pages.slice(0, limit).map((p, i) => {
              const rows: TipRow[] = []
              if (showUsers && p.userCount != null) rows.push({ label: "Distinct users", value: p.userCount })
              const last = fmtDate(p.lastVisit)
              return (
                <EngBarRow
                  key={p.page}
                  n={i + 1}
                  label={pageLabel(p.page)}
                  metric={<>{p.visits.toLocaleString()}<span className="eng-row-metric-unit"> visits</span></>}
                  ratio={p.visits / max}
                  tip={
                    <EngTooltip
                      title={pageLabel(p.page)}
                      note={`${p.visits.toLocaleString()} ${p.visits === 1 ? "visit" : "visits"} · last 30 days`}
                      rows={rows}
                      footer={last ? `Last visit ${last}` : undefined}
                    />
                  }
                />
              )
            })}
          </div>
        )
      }
    </EngListCard>
  )
}
