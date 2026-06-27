import type { ReactNode } from "react"
import { Widget } from "../../../shared/components/Widget/Widget"
import { StatWidget } from "../../../shared/components/StatWidget/StatWidget"

// One half of a Period & Year Summary card — the presentational shell. The
// dashboard's CurrentPeriodSummaryWidget + YearSummaryWidget render this
// with company-wide data from openMonthFinances + marginPerformance, and
// the EmployeeDetailPage renders this with the employee's monthly/yearly
// breakdown rows. Two stacked instances inside a `.summary-snapshot-pair`
// wrapper produce the fused two-card seam (see App.css).

type StatusTone = "open" | "closed" | "future"

export interface SummarySnapshotStat {
  title: string
  value: number | null | undefined
  /** A preset, or a custom formatter when the unit is known (e.g. a ratio→percent). */
  format?: "money" | "percent" | "number" | ((v: number) => string)
  /** Inline color for the value text (e.g. marginTextColor for the Margin tile). */
  valueColor?: string
}

export interface SummarySnapshotCardProps {
  title: string
  /** Card-header right-side content (e.g. period <select>, YearSelector). */
  actions?: ReactNode
  /** Extra className(s) on the underlying Widget. */
  className?: string
  /** Big number/label below the header (e.g. "May 2026", "2026"). */
  headlineLabel: string
  /** Status pill trailing the label (e.g. Open / Closed / Future). */
  headlineStatus?: { tone: StatusTone; label: string } | null
  /** Thin caption trailing the label (e.g. "Year to date", "Full year"). */
  headlineMeta?: string | null
  /** Exactly four stat tiles, in the order they should render. */
  stats: [SummarySnapshotStat, SummarySnapshotStat, SummarySnapshotStat, SummarySnapshotStat]
  loading?: boolean
}

export function SummarySnapshotCard({
  title,
  actions,
  className,
  headlineLabel,
  headlineStatus,
  headlineMeta,
  stats,
  loading,
}: SummarySnapshotCardProps) {
  // `current-period-widget` is the historical hook that applies the tinted
  // parent background; keep it so both the dashboard pair and the employee
  // pair share the same look.
  const widgetClass = `current-period-widget${className ? ` ${className}` : ""}`

  return (
    <Widget title={title} className={widgetClass} actions={actions}>
      <div className="snapshot-headline">
        <span className="snapshot-headline-label">{headlineLabel}</span>
        {headlineStatus && (
          <span className={`snapshot-headline-status snapshot-headline-status--${headlineStatus.tone}`}>
            {headlineStatus.label}
          </span>
        )}
        {headlineMeta && <span className="snapshot-headline-meta">{headlineMeta}</span>}
      </div>
      <div className="stat-grid">
        {stats.map((s, i) => (
          <StatWidget
            key={i}
            title={s.title}
            value={s.value}
            format={s.format ?? "money"}
            valueColor={s.valueColor}
            loading={loading}
          />
        ))}
      </div>
    </Widget>
  )
}
