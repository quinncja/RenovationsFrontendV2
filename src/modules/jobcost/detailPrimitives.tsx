import type { ReactNode } from "react"

// Shared hero primitives for the jobcost detail pages (project + property).
// Both pages render the same deck-surface hero (.jc-group-overview.jcd-hero):
// verdict Facts up top, one quiet inline Meta row beneath.

// One verdict stat in the overview hero, in the app's .stat-widget voice:
// subheadline label on top, .title1 figure (the page's largest type) beneath.
// `value` takes a SkelText shimmer while loading, so the loading and loaded
// hero share this exact markup and can't diverge.
export function Fact({ label, value, sub, valueColor }: {
  label: ReactNode
  value: ReactNode
  sub?: string
  valueColor?: string
}) {
  return (
    <div className="jcd-fact">
      <span className="jcd-fact-label subheadline">{label}</span>
      <span
        className="jcd-fact-value title1 emphasized"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </span>
      {sub && <span className="jcd-fact-sub footnote">{sub}</span>}
    </div>
  )
}

// One identity pair on the hero's inline meta row — same value contract as
// Fact: real data or a SkelText stand-in, one markup for both states.
// `onClick` (role-gated by the caller) turns the value into a drill link.
export function Meta({ label, value, onClick }: { label: ReactNode; value: ReactNode; onClick?: () => void }) {
  return (
    <span className="jcd-meta">
      <span className="jcd-meta-label subheadline">{label}</span>
      {onClick ? (
        <span
          className="jcd-meta-value jcd-meta-link body-text emphasized"
          role="button"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={(e) => e.key === "Enter" && onClick()}
        >
          {value}
        </span>
      ) : (
        <span className="jcd-meta-value body-text emphasized">{value}</span>
      )}
    </span>
  )
}

