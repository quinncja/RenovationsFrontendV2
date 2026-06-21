import type { ReactNode } from "react"
import { Widget } from "../../../shared/components/Widget/Widget"

interface StatPairCardProps {
  title: string
  loading?: boolean
  noData?: boolean
  className?: string
  /** Controls rendered on the right of the header (e.g. the ADVIA tag). */
  actions?: ReactNode
  /** Upper stat block, rendered above the center divider. */
  top: ReactNode
  /** Lower stat block, rendered below the center divider. */
  bottom: ReactNode
  /** Pinned footer row content (e.g. Net overdue position). Omit for an
   *  intentionally-blank footer that STILL reserves the same height. */
  footer?: ReactNode
}

/**
 * Shared layout for the paired Banking / Overdue cards.
 *
 * The whole reason this component exists is the center divider: the two stat
 * blocks each take an exactly-equal half of the space above a fixed-height
 * footer, so the divider between them lands at the same Y in every card that
 * uses this — independent of how tall each block's content is, and independent
 * of whether the footer is filled (Overdue's net position) or blank (Banking).
 *
 * Invariants that keep the dividers aligned — do not break these:
 *   1. The two `.statpair-slot`s are `flex: 1 1 0` (equal halves), so the rule
 *      sits dead-center regardless of content height.
 *   2. The footer reserves a FIXED height (see `.statpair-footer-row`), so a
 *      filled footer and a blank one occupy identical space.
 * Because both cards are equal-height flex siblings with equal-height headers,
 * those two invariants are sufficient for the dividers to coincide.
 */
export function StatPairCard({
  title,
  loading,
  noData,
  className,
  actions,
  top,
  bottom,
  footer,
}: StatPairCardProps) {
  return (
    <Widget
      title={title}
      loading={loading}
      noData={noData}
      className={className}
      actions={actions}
    >
      <div className="statpair-body">
        <div className="statpair-slot">{top}</div>
        <div className="statpair-rule" />
        <div className="statpair-slot">{bottom}</div>
        <div className="statpair-footer">
          <div className={`statpair-footer-rule${footer ? "" : " statpair-footer-rule--ghost"}`} />
          <div className="statpair-footer-row">{footer}</div>
        </div>
      </div>
    </Widget>
  )
}
