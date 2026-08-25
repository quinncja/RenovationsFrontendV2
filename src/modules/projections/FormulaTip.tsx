import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { formatMoneyFull } from "../../shared/utils/format"
import { computeRow } from "./calc"
import type { ProjectionRow } from "./types"

/** Hover popover for derived (computed) cells: shows the formula behind the
 *  number, both symbolically and with the row's live values substituted.
 *  Rendered through a portal at position:fixed so the table's scroll
 *  container can't clip it; sits above the cell with a down arrow. */

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`
const money = (v: number) => formatMoneyFull(v)
const num = (v: number) => String(Math.round(v * 1000) / 1000)

export interface Formula {
  label: string
  /** Symbolic form, e.g. "Units × Avg Unit Price". */
  symbolic: string
  /** Same formula with the row's values filled in. Omit both to show the
   *  symbolic form alone (e.g. a plain sum with nothing worth spelling out). */
  substituted?: string
  result?: string
}

export function describeFormula(row: ProjectionRow, field: string): Formula | null {
  const c = computeRow(row)
  switch (field) {
    case "total":
      return {
        label: "Total",
        symbolic: "Units × Avg Unit Price",
        substituted: `${num(row.units)} × ${money(row.avgUnitPrice)}`,
        result: money(c.total),
      }
    case "cogs":
      return {
        label: "COGS",
        symbolic: "100% − Margin",
        substituted: `100% − ${pct(row.grossMargin)}`,
        result: pct(c.cogs),
      }
    case "grossRevenue":
      return {
        label: "Gross Revenue",
        symbolic: "Total × % Win",
        substituted: `${money(c.total)} × ${pct(row.pctWin)}`,
        result: money(c.grossRevenue),
      }
    case "grossProfit":
      return {
        label: "Gross Profit",
        symbolic: "Gross Revenue × Margin",
        substituted: `${money(c.grossRevenue)} × ${pct(row.grossMargin)}`,
        result: money(c.grossProfit),
      }
    case "unitsScheduled":
      return { label: "Scheduled", symbolic: "Sum of monthly units" }
    case "unitsRemaining":
      return {
        label: "Unscheduled",
        symbolic: "Units − Scheduled",
        substituted: `${num(row.units)} − ${num(c.unitsScheduled)}`,
        result: num(c.unitsRemaining),
      }
    default:
      return null
  }
}

const GAP = 8 // px between arrow tip and cell top
const EDGE = 8 // viewport margin

export function FormulaTip({ anchor, formula }: { anchor: HTMLElement; formula: Formula }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const a = anchor.getBoundingClientRect()
    const w = el.offsetWidth
    const h = el.offsetHeight
    const cx = a.left + a.width / 2
    const left = Math.min(Math.max(EDGE, cx - w / 2), window.innerWidth - w - EDGE)
    setPos({ left, top: a.top - GAP - h, arrow: cx - left })
  }, [anchor, formula])

  return createPortal(
    <div
      ref={ref}
      className="pj-formula-tip"
      role="tooltip"
      style={pos ? { left: pos.left, top: pos.top, "--pj-tip-arrow": `${pos.arrow}px` } as React.CSSProperties : { visibility: "hidden", left: 0, top: 0 }}
    >
      <div className="pj-formula-tip-sym">{formula.symbolic}</div>
      {formula.substituted != null && (
        <div className="pj-formula-tip-sub">
          <span>{formula.substituted}</span>
          <span className="pj-formula-tip-eq">=</span>
          <span className="pj-formula-tip-result">{formula.result}</span>
        </div>
      )}
    </div>,
    document.body
  )
}

/** Hover state for one cell: opens after a short delay, closes on leave, on
 *  any scroll (the fixed popover would otherwise drift off its cell), when
 *  the pointer leaves the document or the window loses focus (no leave
 *  event reaches the cell then, so the tip would otherwise stay up), or
 *  when `disabled` (paint mode) flips on. */
export function useFormulaHover(disabled: boolean) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const timer = useRef<number | null>(null)
  const clear = () => {
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = null
  }
  const onEnter = (el: HTMLElement) => {
    if (disabled) return
    clear()
    timer.current = window.setTimeout(() => setAnchor(el), 160)
  }
  const onLeave = () => {
    clear()
    setAnchor(null)
  }
  useEffect(() => {
    if (!anchor) return
    const close = () => setAnchor(null)
    window.addEventListener("scroll", close, true)
    window.addEventListener("blur", close)
    document.documentElement.addEventListener("mouseleave", close)
    return () => {
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("blur", close)
      document.documentElement.removeEventListener("mouseleave", close)
    }
  }, [anchor])
  useEffect(() => {
    if (disabled) setAnchor(null)
  }, [disabled])
  useEffect(() => clear, [])
  return { anchor, onEnter, onLeave }
}

export function FormulaHoverSlot({ anchor, row, field }: { anchor: HTMLElement | null; row: ProjectionRow; field: string }): ReactNode {
  if (!anchor) return null
  const f = describeFormula(row, field)
  return f ? <FormulaTip anchor={anchor} formula={f} /> : null
}
