import { Fragment, useState, type ReactNode } from "react"
import { SkelText } from "../../../shared/components/SkelText"
import { formatMoneyFull } from "../../../shared/utils/format"

// One column of the Period & Year Summary widget. The bands sit on their
// own white sheet inside the widget's warm surface; the eyebrow and its
// period/year selector stay outside it, so the header reads as a label on
// the card and the sheet reads as the statement.
//
// Every row shares one pitch and one size. What varies is the ROLE each
// line plays in the arithmetic, shown the way the math is actually written:
// a leading operator gutter, a rule where the sum lands, and the result in
// semibold.
//
//     Billed Income        $
//   − COGS                 $
//   ───────────────────────────
//   = Gross Profit         $      result of the first subtraction
//       Margin             %      a qualifier of the line above
//   − Overhead             $      and an operand of the second
//   ───────────────────────────
//   = Net Profit           $      result

/** The line's part in the arithmetic: a plain operand, one being
 *  subtracted, the result of the subtraction above, or a qualifier of the
 *  line above it (Margin under Gross Profit). */
export type LineRole = "operand" | "minus" | "result" | "qualifier"

export interface SummaryLine {
  label: string
  role?: LineRole
  value: number | null | undefined
  /** Defaults to full money; pass a formatter for ratios. */
  format?: (v: number) => string
  valueColor?: string
  /** Skeleton width hint, in characters. */
  skelCh?: number
}

/** Bands in waterfall order. `input` is quiet, `result` carries the
 *  mid-emphasis figures, `final` is the single conclusion. */
export type BandKind = "input" | "result" | "final"

export interface SummaryColumnProps {
  eyebrow: string
  /** Changes whenever the column switches to a different period/year. The
   *  sheet answers with a single copper ripple, so a click on the Margin
   *  chart visibly lands here. */
  pulseKey?: string
  /** Selector controls, right-aligned on the eyebrow row. */
  actions?: ReactNode
  groups: Array<{ kind: BandKind; lines: SummaryLine[] }>
  loading?: boolean
}

const OPERATOR: Record<LineRole, string> = {
  operand: "",
  minus: "\u2212",
  result: "=",
  qualifier: "",
}

function Line({ line, loading }: { line: SummaryLine; loading?: boolean }) {
  const fmt = line.format ?? formatMoneyFull
  const role = line.role ?? "operand"
  return (
    <div className={`pys-row pys-row-${role}`}>
      <span className="pys-op" aria-hidden="true">{OPERATOR[role]}</span>
      <span className="pys-label">{line.label}</span>
      <span
        className="pys-value"
        style={!loading && line.valueColor ? { color: line.valueColor } : undefined}
      >
        {loading ? <SkelText ch={line.skelCh ?? 8} /> : line.value == null ? "—" : fmt(line.value)}
      </span>
    </div>
  )
}

export function SummaryColumn({ eyebrow, actions, groups, loading, pulseKey }: SummaryColumnProps) {
  // One sweep per change, keyed so a rapid second selection restarts it
  // rather than queueing. The first render never pulses — only real changes.
  // Adjusted during render (not in an effect) so there's no extra commit.
  const [ripple, setRipple] = useState(0)
  const [lastKey, setLastKey] = useState(pulseKey)
  if (pulseKey !== undefined && pulseKey !== lastKey) {
    setLastKey(pulseKey)
    setRipple((n) => n + 1)
  }

  return (
    <div className="pys-col">
      <div className="pys-eyebrow">
        <span className="pys-title widget-title headline">{eyebrow}</span>
        {actions && <span className="pys-actions">{actions}</span>}
      </div>
      <div className="pys-sheet" key={`sheet-${ripple}`}>
        {ripple > 0 && <span className="pys-ripple" aria-hidden="true" />}
        {groups.map((g, gi) => (
          <Fragment key={gi}>
            {/* The seam is its own element, not a band border: both seams
                then grow by the same amount when the sheet is taller than
                its content, keeping the row rhythm even. */}
            {gi > 0 && <div className="pys-seam" />}
            <div className={`pys-band pys-band-${g.kind}`}>
              {g.lines.map((l, i) => <Line key={i} line={l} loading={loading} />)}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
