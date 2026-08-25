import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  useMemo,
} from "react"
import { createPortal } from "react-dom"
import { Ban, Paintbrush, X } from "lucide-react"
import { FILL_SWATCHES, withFacet, type StyleFacet, type SwatchDef } from "./cellStyles"
import type { CellEdit, CellStyle, ProjectionSheet } from "./types"
import type { HistoryLabel } from "./useProjectionBoard"

// Cell coloring (decorative): an always-open swatch bar in each table's card
// head. Two ways to color a cell:
//   1. Focus a cell, click a swatch — applies to that cell. Every control in
//      the bar swallows mousedown, so focus (and an open editor) never leaves
//      the cell while picking.
//   2. Paint mode: with no cell focused, clicking a swatch arms it as a brush;
//      clicking cells then applies it. Clicking a cell that already wears
//      exactly that color clears it. Press-and-drag selects a rectangle
//      (anchor cell to the cell under the pointer, within one table); a
//      single dashed marquee traces the area's outer bounds while dragging
//      and every cell inside is painted on release, as ONE undo step. The
//      anchor decides whether the whole area applies or clears. Derived
//      (read-only) columns take paint like any other cell. Esc or the pill
//      ends painting.
// Only the fill facet is offered here — text color (ink) is retired from the
// UI; the backend still accepts/stores ink tokens for old data.
// Edits travel the board's normal pipeline as `style:<field>` CellEdits, so
// they batch, undo, audit, broadcast, and snapshot like any value change.

export interface ActiveCell {
  rowId: string
  field: string
}

export interface PaintBrush {
  facet: StyleFacet
  token: string
}

interface CellFormatCtx {
  /** Record the last-focused editable cell — the swatch-click target. */
  setActiveCell: (cell: ActiveCell) => void
  getActiveCell: () => ActiveCell | null
  /** The remembered target, as state — so the swatch bar can show its
   *  current fill (ref reads alone would never re-render it). */
  getStyle: (rowId: string, field: string) => CellStyle | undefined
  /** Set one color facet on a cell (empty token clears that facet). */
  applyFacet: (rowId: string, field: string, facet: StyleFacet, token: string) => void
  paint: PaintBrush | null
  setPaint: (brush: PaintBrush | null) => void
  /** Arm paint mode with the most recently picked swatch. */
  armPaint: () => void
  /** A paint-mode press on a cell (an anchor input or a derived <td>; both
   *  carry data-rowid/data-col/data-row): anchor an area selection there. A
   *  plain click (release on the same cell) paints just that cell. */
  paintCell: (rowId: string, field: string, el: HTMLElement) => void
  /** The pointer entered a cell — extends the area if one is anchored. */
  paintOver: (el: HTMLElement) => void
}

const CellFormatContext = createContext<CellFormatCtx | null>(null)
/** The focused cell, in its OWN context: only the swatch bar reads it, so a
 *  focus change never re-renders the cells themselves. */
const ActiveCellContext = createContext<ActiveCell | null>(null)
export const useActiveCell = () => useContext(ActiveCellContext)
export const useCellFormat = () => useContext(CellFormatContext)

const DEFAULT_BRUSH: PaintBrush = { facet: "fill", token: "amber" }

/** One press-and-drag: the anchor cell, the token the area ends up with
 *  ("" = clearing), the current far corner, the cells currently inside, and
 *  the marquee element tracing their outer bounds. */
interface Stroke {
  anchor: HTMLElement
  token: string
  corner: HTMLElement
  marked: HTMLElement[]
  marquee: HTMLDivElement | null
}

const cellTd = (el: HTMLElement) => el.closest("td")
/** Every paintable cell inside the rectangle spanned by two cells of one
 *  table (row index × column index): anchor inputs and derived <td>s, both
 *  tagged data-rowid/data-col/data-row. Editor chips live outside the table,
 *  so they never match; cells of another table never match either. */
function areaCells(a: HTMLElement, b: HTMLElement): HTMLElement[] {
  const table = a.closest("table")
  const ta = cellTd(a), tb = cellTd(b)
  if (!table || !ta || !tb || b.closest("table") !== table) return [a]
  const r0 = Number(a.dataset.row), r1 = Number(b.dataset.row)
  const c0 = ta.cellIndex, c1 = tb.cellIndex
  const [rMin, rMax] = r0 < r1 ? [r0, r1] : [r1, r0]
  const [cMin, cMax] = c0 < c1 ? [c0, c1] : [c1, c0]
  const out: HTMLElement[] = []
  table.querySelectorAll<HTMLElement>("tbody [data-rowid][data-col]").forEach((el) => {
    const r = Number(el.dataset.row)
    const td = cellTd(el)
    if (!td || r < rMin || r > rMax) return
    if (td.cellIndex < cMin || td.cellIndex > cMax) return
    out.push(el)
  })
  return out
}

/** Lay the marquee over the union of the cells' <td> boxes, in the scroll
 *  container's content coordinates (it is an absolute child of the
 *  scroller, like the editor chip, so it rides the scroll natively). */
function layoutMarquee(marquee: HTMLDivElement, cells: HTMLElement[]) {
  const sc = marquee.parentElement
  if (!sc) return
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity
  for (const el of cells) {
    const td = cellTd(el)
    if (!td) continue
    const x = td.getBoundingClientRect()
    if (x.left < l) l = x.left
    if (x.top < t) t = x.top
    if (x.right > r) r = x.right
    if (x.bottom > b) b = x.bottom
  }
  if (l === Infinity) {
    marquee.style.display = "none"
    return
  }
  const c = sc.getBoundingClientRect()
  marquee.style.display = ""
  marquee.style.left = `${l - c.left + sc.scrollLeft - sc.clientLeft}px`
  marquee.style.top = `${t - c.top + sc.scrollTop - sc.clientTop}px`
  marquee.style.width = `${r - l}px`
  marquee.style.height = `${b - t}px`
}

export function CellFormatProvider({
  sheet,
  onEdit,
  onEdits,
  children,
}: {
  sheet: ProjectionSheet | null
  onEdit: (edit: CellEdit) => void
  /** Several edits as ONE undo step (an area stroke). Falls back to one
   *  onEdit per cell when absent. */
  onEdits?: (edits: CellEdit[], label: HistoryLabel) => void
  children: ReactNode
}) {
  const [paint, setPaint] = useState<PaintBrush | null>(null)
  const [activeCell, setActiveState] = useState<ActiveCell | null>(null)
  const activeRef = useRef<ActiveCell | null>(null)
  const lastBrushRef = useRef<PaintBrush>(DEFAULT_BRUSH)
  const paintRef = useRef<PaintBrush | null>(null)
  paintRef.current = paint
  const sheetRef = useRef(sheet)
  sheetRef.current = sheet

  const setActiveCell = useCallback((cell: ActiveCell) => {
    activeRef.current = cell
    setActiveState((prev) => (prev?.rowId === cell.rowId && prev.field === cell.field ? prev : cell))
  }, [])
  const getActiveCell = useCallback(() => activeRef.current, [])

  const getStyle = useCallback((rowId: string, field: string) => {
    const s = sheetRef.current
    const row = s?.rows.find((r) => r.rowId === rowId) ?? s?.pipeline.find((r) => r.rowId === rowId)
    return row?.styles?.[field]
  }, [])

  const applyFacet = useCallback(
    (rowId: string, field: string, facet: StyleFacet, token: string) => {
      if (token) lastBrushRef.current = { facet, token }
      onEdit({ rowId, field: `style:${field}`, value: withFacet(getStyle(rowId, field), facet, token) })
    },
    [onEdit, getStyle]
  )

  const setPaintTracked = useCallback((brush: PaintBrush | null) => {
    if (brush?.token) lastBrushRef.current = brush
    setPaint(brush)
  }, [])
  const armPaint = useCallback(() => setPaint(lastBrushRef.current), [])

  const strokeRef = useRef<Stroke | null>(null)

  // The marquee: one dashed rectangle around the area's outer bounds, in
  // the brush's color (neutral when erasing). Created on the first press,
  // re-laid on every corner change, removed when the stroke ends.
  const mark = (stroke: Stroke, cells: HTMLElement[]) => {
    stroke.marked = cells
    if (cells.length === 0) {
      stroke.marquee?.remove()
      stroke.marquee = null
      return
    }
    if (!stroke.marquee) {
      const sc = stroke.anchor.closest<HTMLElement>(".pj-grid-scroll")
      if (!sc) return
      const m = document.createElement("div")
      m.className = "pj-paint-marquee"
      if (stroke.token) m.style.setProperty("--pj-sel-ring", `var(--pj-c-${stroke.token})`)
      sc.appendChild(m)
      stroke.marquee = m
    }
    layoutMarquee(stroke.marquee, cells)
  }

  const paintCell = useCallback(
    (rowId: string, field: string, el: HTMLElement) => {
      const brush = paintRef.current
      if (!brush) return
      const current = getStyle(rowId, field)?.[brush.facet] ?? ""
      const token = current === brush.token ? "" : brush.token
      const stroke: Stroke = { anchor: el, token, corner: el, marked: [], marquee: null }
      mark(stroke, [el])
      strokeRef.current = stroke
      document.body.classList.add("pj-paint-stroke")
    },
    [getStyle]
  )

  const paintOver = useCallback((el: HTMLElement) => {
    const stroke = strokeRef.current
    if (!stroke || stroke.corner === el) return
    stroke.corner = el
    mark(stroke, areaCells(stroke.anchor, el))
  }, [])

  // Release commits the area as ONE undo step (cells whose fill wouldn't
  // change are skipped); losing the window drops it. Ending the mode drops
  // it too.
  useEffect(() => {
    const finish = (commit: boolean) => {
      const stroke = strokeRef.current
      if (!stroke) return
      const brush = paintRef.current
      const cells = stroke.marked
      mark(stroke, [])
      strokeRef.current = null
      document.body.classList.remove("pj-paint-stroke")
      if (!commit || !brush) return
      if (stroke.token) lastBrushRef.current = { facet: brush.facet, token: stroke.token }
      const edits: CellEdit[] = []
      cells.forEach((el) => {
        const rowId = el.dataset.rowid
        const field = el.dataset.col
        if (!rowId || !field) return
        const style = getStyle(rowId, field)
        if ((style?.[brush.facet] ?? "") === stroke.token) return
        edits.push({ rowId, field: `style:${field}`, value: withFacet(style, brush.facet, stroke.token) })
      })
      if (edits.length === 0) return
      if (edits.length === 1 || !onEdits) {
        edits.forEach(onEdit)
        return
      }
      const n = `${edits.length} cells`
      onEdits(
        edits,
        stroke.token
          ? { undo: `Undid painting ${n}`, redo: `Painted ${n} again` }
          : { undo: `Put the color back on ${n}`, redo: `Cleared the color on ${n} again` }
      )
    }
    const onUp = () => finish(true)
    const onBlur = () => finish(false)
    window.addEventListener("mouseup", onUp, true)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("mouseup", onUp, true)
      window.removeEventListener("blur", onBlur)
      finish(false)
    }
  }, [getStyle, onEdit, onEdits])

  // Painting: bucket cursor over cells, Esc ends the mode (capture, so it
  // can't also collapse full-screen mode or reach other Esc handlers).
  useEffect(() => {
    if (!paint) return
    document.body.classList.add("pj-painting")
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      setPaint(null)
    }
    window.addEventListener("keydown", onKey, true)
    return () => {
      document.body.classList.remove("pj-painting", "pj-paint-stroke")
      const stroke = strokeRef.current
      if (stroke) {
        mark(stroke, [])
        strokeRef.current = null
      }
      window.removeEventListener("keydown", onKey, true)
    }
  }, [paint])

  // A click that lands outside any cell (and outside the swatch bar) drops
  // the remembered target, so a swatch never colors a cell the user no
  // longer thinks of as selected.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest(".pj-cell-input, .pj-format-bar")) return
      activeRef.current = null
      setActiveState(null)
    }
    window.addEventListener("mousedown", onDown, true)
    return () => window.removeEventListener("mousedown", onDown, true)
  }, [])

  const ctx = useMemo<CellFormatCtx>(
    () => ({ setActiveCell, getActiveCell, getStyle, applyFacet, paint, setPaint: setPaintTracked, armPaint, paintCell, paintOver }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setActiveCell, getActiveCell, getStyle, applyFacet, paint, setPaintTracked, armPaint]
  )

  return (
    <CellFormatContext.Provider value={ctx}>
    <ActiveCellContext.Provider value={activeCell}>
      {children}
      {paint &&
        createPortal(
          <button className="pj-paint-pill callout" onClick={() => setPaint(null)} title="Finish painting">
            <Paintbrush size={13} />
            <span
              className={`pj-swatch pj-paint-pill-swatch ${
                paint.token ? `pj-swatch-fill-${paint.token}` : "pj-swatch-clear"
              }`}
            >
              {!paint.token && <Ban size={11} />}
            </span>
            {paint.token ? "Painting" : "Erasing"}
            <span className="pj-paint-pill-hint">Esc to finish</span>
            <X size={13} className="pj-paint-pill-x" />
          </button>,
          document.body
        )}
    </ActiveCellContext.Provider>
    </CellFormatContext.Provider>
  )
}

function Swatch({
  def,
  current,
  onPick,
}: {
  def: SwatchDef
  current: string
  onPick: (token: string) => void
}) {
  return (
    <button
      className={`pj-swatch pj-swatch-fill-${def.token}${current === def.token ? " pj-swatch-current" : ""}`}
      title={`${def.label} fill`}
      aria-label={`${def.label} fill`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(def.token)}
    />
  )
}

/** The always-open swatch bar for a table's card head. With a cell focused, a
 *  swatch colors that cell; with nothing focused, it arms paint mode. */
export function CellFormatBar() {
  const fmt = useCellFormat()
  const activeCell = useActiveCell()
  if (!fmt) return null
  const { paint } = fmt

  // The ringed swatch: the armed brush while painting; otherwise the active
  // cell's current fill (null when it has none / nothing is active).
  const activeFill = activeCell ? (fmt.getStyle(activeCell.rowId, activeCell.field)?.fill ?? "") : null
  const currentFill = paint?.facet === "fill" ? paint.token : activeFill

  // A swatch pick: retarget the brush while painting; otherwise color the
  // focused cell — or, on the color it already wears, clear it; with
  // nothing focused, picking a color starts painting.
  const pick = (token: string) => {
    if (paint) {
      fmt.setPaint({ facet: "fill", token })
      return
    }
    const cell = fmt.getActiveCell()
    if (cell) {
      fmt.applyFacet(cell.rowId, cell.field, "fill", token && token === activeFill ? "" : token)
      return
    }
    fmt.setPaint({ facet: "fill", token })
  }

  return (
    <div
      className={`pj-format-bar${paint ? " pj-format-bar-painting" : ""}`}
      role="toolbar"
      aria-label="Cell colors"
    >
      <button
        className="pj-format-bar-icon"
        title={paint ? "Finish painting" : "Paint cells"}
        aria-label={paint ? "Finish painting" : "Paint cells"}
        aria-pressed={!!paint}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (paint ? fmt.setPaint(null) : fmt.armPaint())}
      >
        <Paintbrush size={14} />
      </button>
      {FILL_SWATCHES.map((d) => (
        <Swatch key={d.token} def={d} current={currentFill ?? ""} onPick={pick} />
      ))}
      <button
        className={`pj-swatch pj-swatch-clear${paint && !paint.token ? " pj-swatch-current" : ""}`}
        title="Clear fill"
        aria-label="Clear fill"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => pick("")}
      >
        <Ban size={11} />
      </button>
    </div>
  )
}
