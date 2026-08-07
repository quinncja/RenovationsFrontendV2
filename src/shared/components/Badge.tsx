import type { ReactNode } from "react"

// Small colored status pill — the shape `.invoice-status-badge` and
// `.ewl-badge` each hand-rolled independently with byte-identical color
// values (red/amber/green match exactly between the two). One component,
// one CSS definition per tone; `size` preserves each site's original
// geometry rather than forcing a match (compact = ewl-badge's tighter
// table-row sizing, standard = invoice-status-badge's).
//
// Scope note: `.status-badge` (numeric job-status codes), `.jc-status-badge`,
// `.inv-type-badge`, `.org-cat-pill`, `.usr-column-badge`, and `.bank-pill`
// were NOT folded in here — each has at least one genuinely distinct color
// or geometry value (not just copy-paste drift), so merging them risked a
// real, unverifiable visual change. Worth a follow-up pass with browser QA.

export type BadgeTone = "blue" | "green" | "amber" | "red" | "gray" | "muted" | "purple"

export function Badge({
  tone,
  size = "standard",
  children,
  title,
  className,
}: {
  tone: BadgeTone
  /** compact = ewl-badge's original geometry, standard = invoice-status-badge's. */
  size?: "standard" | "compact"
  children: ReactNode
  title?: string
  className?: string
}) {
  return (
    <span
      className={`badge badge--${tone} badge--${size}${className ? ` ${className}` : ""}`}
      title={title}
    >
      {children}
    </span>
  )
}
