import { ChevronDown } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"

// Mirrors the det-section pattern used in 93E's directory detail pages: a
// card with a always-visible header (title + metrics row + Show/Hide
// toggle) and a collapsible body. Used to wrap the Projects + Invoices
// tables on Client / Subcontractor / Vendor detail pages.
//
// All CSS classes (det-section*, inv-metric*, inv-metrics-skeleton) are
// already shipping in App.css — this is just the JSX wrapper.

interface CollapsibleSectionProps {
  title: string
  open: boolean
  onToggle: () => void
  /** Loading bar shown above the body until data resolves. */
  loading?: boolean
  /** True once loading is done and there's nothing to show. */
  isEmpty?: boolean
  /** Message rendered in the header when isEmpty. Defaults to a generic line. */
  emptyMessage?: string
  /** Metric tiles for the always-visible header. Pass <Metric>s + <MetricDivider>s. */
  metrics?: ReactNode
  /** Body content (table) — collapses behind the Show/Hide toggle. */
  children?: ReactNode
  /** Icon shown in a tinted square badge to the left of the title. */
  icon?: ReactNode
  /** CSS color used for the icon badge tint and the card's left-edge accent
   *  stripe. Pass a hex (or any CSS color); the badge uses `color-mix` to
   *  derive a soft background tint from it. Only meaningful with `icon`. */
  accentColor?: string
}

export function CollapsibleSection({
  title,
  open,
  onToggle,
  loading,
  isEmpty,
  emptyMessage = "No data.",
  metrics,
  children,
  icon,
  accentColor,
}: CollapsibleSectionProps) {
  // Left-edge accent stripe rides on a CSS variable so the rule lives in
  // App.css (`.det-section[data-accent]`) but the color is JSX-controlled.
  const accentStyle = accentColor
    ? ({ "--det-section-accent": accentColor } as CSSProperties)
    : undefined

  return (
    <div className="det-section card" data-accent={accentColor ? "" : undefined} style={accentStyle}>
      <div className="det-section-toggle" onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onToggle()}>
        <div className="det-section-header">
          <div className="det-section-title-group">
            {icon && <span className="det-section-icon">{icon}</span>}
            <span className="widget-title headline">{title}</span>
          </div>
          <span className="det-section-action">
            {open ? "Hide" : "Show"}
            <ChevronDown size={13} className={`det-section-chevron${open ? " open" : ""}`} />
          </span>
        </div>

        {loading && <div className="inv-metrics-skeleton" style={{ margin: "0 1.25rem 1rem" }} />}

        {!loading && isEmpty && (
          <p className="body-text text-secondary" style={{ padding: "0 1.25rem 1rem" }}>{emptyMessage}</p>
        )}

        {!loading && !isEmpty && metrics && (
          <div className="det-section-metrics">
            <div className="inv-metrics-row">{metrics}</div>
          </div>
        )}
      </div>

      {!loading && !isEmpty && children && (
        <div className={`det-section-body${open ? " open" : ""}`}>
          <div className="det-section-body-inner">
            <hr className="det-section-separator" />
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

interface MetricProps {
  value: ReactNode
  label: string
  /** e.g. "jc-margin-high", "jc-margin-critical", "invoice-amount-value--remaining". */
  valueClass?: string
}

export function Metric({ value, label, valueClass }: MetricProps) {
  return (
    <div className="inv-metric">
      <span className={`inv-metric-value${valueClass ? ` ${valueClass}` : ""}`}>{value}</span>
      <span className="inv-metric-label">{label}</span>
    </div>
  )
}

export function MetricDivider() {
  return <div className="inv-metric-divider" />
}
