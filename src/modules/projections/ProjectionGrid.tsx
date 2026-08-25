import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Trash2, Plus, Maximize2, Minimize2 } from "lucide-react"
import { ConfirmModal } from "../../shared/components/ConfirmModal/ConfirmModal"
import { SortTh } from "../../shared/components/SortTh"
import { formatMoneyFull, shortMonth } from "../../shared/utils/format"
import { computeRow } from "./calc"
import { useOverlayScroll, useCardFullscreen } from "./useOverlayScroll"
import { useCollab, cellKey, peerLabel } from "./useProjectionCollab"
import { ActiveCellEditor, useEditorHost, type CellKind } from "./ActiveCellEditor"
import { CellFormatBar, useCellFormat } from "./CellFormat"
import { styleClass } from "./cellStyles"
import { FormulaHoverSlot, useFormulaHover } from "./FormulaTip"
import { RowDragTable, RowGrip, SortableRow, useAwardDropTarget } from "./RowDrag"
import { AwardConfetti, type ConfettiOrigin } from "./AwardConfetti"
import { orderRows, pinAddrClick, pinHeaderClick, useProjectionSort } from "./rowOrder"
import type { CellEdit, ProjectionRow, ProjectionSummary } from "./types"
import type { AwardVia } from "./useProjectionBoard"

/** Button-award page glide: unhurried, and it stops once the landed row
 *  and the few above it are in view rather than pulling the whole card up. */
const PAGE_GLIDE_MS = 1100

/** Scroll `el` (or the window) to `top` over `ms` with an ease-in-out,
 *  driven by rAF so the pace is ours, not the browser's "smooth". */
function glideTo(target: Window | HTMLElement, top: number, ms: number, onDone: () => void) {
  const from = target instanceof Window ? target.scrollY : target.scrollTop
  const delta = top - from
  if (Math.abs(delta) < 1) { onDone(); return () => {} }
  let raf = 0
  let start = 0
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  const step = (now: number) => {
    if (!start) start = now
    const t = Math.min(1, (now - start) / ms)
    const y = from + delta * ease(t)
    if (target instanceof Window) target.scrollTo(0, y)
    else target.scrollTop = y
    if (t < 1) raf = requestAnimationFrame(step)
    else onDone()
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}

export interface EditableCol {
  key: string
  label: string
  kind: CellKind
}

// Column order mirrors the source sheet: identity → economics → monthly schedule.
export const IDENTITY_COLS: EditableCol[] = [
  { key: "address", label: "Address", kind: "text" },
  { key: "client", label: "Client", kind: "text" },
  { key: "name", label: "Name", kind: "text" },
]
export const ECON_COLS: EditableCol[] = [
  { key: "units", label: "Units", kind: "int" },
  { key: "avgUnitPrice", label: "Avg Unit Price", kind: "money" },
  { key: "pctWin", label: "% Win", kind: "pct" },
  { key: "grossMargin", label: "Margin", kind: "pct" },
]
// kind "unit", not "int": lump jobs schedule fractional slices (0.05, 0.2) of
// a single unit per month, so month cells must keep decimals through edits.
const MONTH_COLS: EditableCol[] = Array.from({ length: 12 }, (_, m) => ({
  key: `month:${m}`,
  label: shortMonth(m + 1),
  kind: "unit",
}))

export const fmtPct = (v: number) => `${Math.round(v * 1000) / 10}%`
const fmtInt = (v: number) => (v === 0 ? "–" : String(v))

function display(kind: CellKind, value: string | number): string {
  if (kind === "text") return String(value)
  const n = Number(value)
  if (kind === "money") return n === 0 ? "" : formatMoneyFull(n)
  if (kind === "pct") return fmtPct(n)
  return n === 0 ? "" : String(n)
}

interface CellProps {
  row: ProjectionRow
  col: EditableCol
  value: string | number
  rowIndex: number
  onCommit: (edit: CellEdit) => void
}

/** A derived (read-only) cell. Not editable, but it takes paint like any
 *  other cell: tagged like the anchors (data-rowid/data-col/data-row) so
 *  area strokes include it, wears its fill class, and forwards paint-mode
 *  presses/enters. Renders the <td> itself. */
export function ComputedCell({
  row,
  field,
  rowIndex,
  className,
  children,
}: {
  row: ProjectionRow
  field: string
  rowIndex: number
  className?: string
  children?: ReactNode
}) {
  const format = useCellFormat()
  const tip = useFormulaHover(!!format?.paint)
  return (
    <td
      className={`pj-num pj-computed${className ? ` ${className}` : ""}${styleClass(row.styles?.[field])}`}
      data-rowid={row.rowId}
      data-col={field}
      data-row={rowIndex}
      onMouseDown={(e) => {
        if (!format?.paint) return
        e.preventDefault()
        format.paintCell(row.rowId, field, e.currentTarget)
      }}
      onMouseEnter={(e) => {
        format?.paintOver(e.currentTarget)
        tip.onEnter(e.currentTarget)
      }}
      onMouseLeave={tip.onLeave}
    >
      {children}
      <FormulaHoverSlot anchor={tip.anchor} row={row} field={field} />
    </td>
  )
}

/** One editable cell: a read-only in-table anchor showing the formatted
 *  value. Focusing it hands the cell to the grid's single ActiveCellEditor,
 *  which floats over it; while that session runs the editor writes the raw
 *  draft into this input imperatively, so the live value scrolls natively
 *  with the sheet (and shows under the sticky bands where the chip tucks).
 *  Memoized: it re-renders only when its own row/value changes or a peer
 *  takes or leaves the cell, never on another cell's focus or keystroke. */
export const EditableCell = memo(function EditableCell({ row, col, value, rowIndex, onCommit }: CellProps) {
  const editor = useEditorHost()
  const collab = useCollab()
  const remote = collab?.remoteCells.get(cellKey(row.rowId, col.key))
  const format = useCellFormat()
  const styling = row.styles?.[col.key]
  const shown = display(col.kind, value)
  // While a peer types, their unparsed draft shows in place of the value.
  const showPreview = remote?.preview != null

  return (
    <span className="pj-cell-shell">
      <input
        className={`pj-cell-input pj-kind-${col.kind}${remote ? " pj-remote-held" : ""}${showPreview ? " pj-remote-previewing" : ""}${styleClass(styling)}`}
        style={remote ? ({ "--pj-peer": remote.color } as CSSProperties) : undefined}
        data-row={rowIndex}
        data-col={col.key}
        data-rowid={row.rowId}
        // The editor restores this when a session ends without a change.
        data-display={shown}
        value={showPreview ? remote.preview : shown}
        readOnly
        onFocus={(e) =>
          editor?.open(e.currentTarget, {
            rowId: row.rowId,
            field: col.key,
            kind: col.kind,
            rowIndex,
            value,
            styling,
            onCommit,
          })
        }
        onMouseDown={(e) => {
          // Paint mode: the click applies the brush instead of opening the
          // editor (preventDefault stops the focus that would open it).
          if (!format?.paint) return
          e.preventDefault()
          format.paintCell(row.rowId, col.key, e.currentTarget)
        }}
        // Area paint: while a press is held, the cell under the pointer is
        // the far corner of the selection.
        onMouseEnter={(e) => format?.paintOver(e.currentTarget)}
        spellCheck={false}
      />
      {remote && (
        <span className="pj-peer-flag" style={{ background: remote.color }}>
          {peerLabel(remote.peer).trim().split(/\s+/)[0]}
          {remote.others > 0 ? ` +${remote.others}` : ""}
        </span>
      )}
    </span>
  )
})

export function blankRow(rowId: string, sortOrder: number): ProjectionRow {
  return {
    rowId,
    address: "",
    client: "",
    name: "",
    units: 0,
    avgUnitPrice: 0,
    pctWin: 1,
    grossMargin: 0.22,
    months: Array(12).fill(0),
    sortOrder,
  }
}

const isBlank = (v: string | number) => v === "" || v === 0

/** Renders every data cell of one row (identity → computed → schedule) so the
 *  add-row draft and the real rows share one column layout. `grip` mounts
 *  the drag handle (only valid inside a SortableRow). */
export type RenderCells = (row: ProjectionRow, rowIndex: number, onCommit: (edit: CellEdit) => void, grip: boolean) => ReactNode

export interface AddSlot {
  key: string
  className?: string
  editable?: boolean
}

interface DraftRowOptions {
  /** Rows the table is showing, in display order. */
  ordered: ProjectionRow[]
  /** Where to look for the draft's inputs (the table's scroll container). */
  scrollRef: RefObject<HTMLElement | null>
  /** Create the row under `rowId`, seeded with the first committed value.
   *  Must apply synchronously (optimistic) so the row is in `ordered` on the
   *  very next render. */
  onAddRow: (rowId: string, initial: CellEdit[]) => void
  onEdit: (edit: CellEdit) => void
}

/** The add-project line as a *draft row*: a blank row rendered through the
 *  table's ordinary row path under a client-minted id. The first committed
 *  value creates the sheet row under that same id, so the React key, the DOM
 *  row, the focused input and the open editor all carry straight over:
 *  nothing swaps, nothing remounts, whichever key (Enter / Tab / arrows)
 *  moved the cursor. An untouched draft goes back to the button the moment
 *  focus leaves it. */
export function useDraftRow({ ordered, scrollRef, onAddRow, onEdit }: DraftRowOptions) {
  const [draft, setDraft] = useState<ProjectionRow | null>(null)
  const draftRef = useRef<ProjectionRow | null>(null)
  draftRef.current = draft
  const focusCol = useRef<string | null>(null)
  /** Draft ids that have been created (guards a second commit routed through
   *  a cell that opened before the row went live). */
  const created = useRef<Set<string>>(new Set())

  const live = draft != null && ordered.some((r) => r.rowId === draft.rowId)
  // The sheet row exists: the draft entry is redundant (same key, same DOM).
  useEffect(() => {
    if (live) setDraft(null)
  }, [live])

  const rows = useMemo(() => (draft && !live ? [...ordered, draft] : ordered), [ordered, draft, live])

  const open = (col: string) => {
    focusCol.current = col
    if (!draftRef.current) setDraft(blankRow(crypto.randomUUID(), ordered.length))
  }

  const isDraftFocused = () => {
    const d = draftRef.current
    const a = document.activeElement as HTMLElement | null
    if (!d || !a) return false
    if (a.dataset.rowid === d.rowId) return true
    if (a.classList.contains("pj-cell-editor") && a.dataset.row === String(ordered.length)) return true // floating chip
    return false
  }

  // Put the cursor in the clicked column the moment the draft mounts.
  useLayoutEffect(() => {
    const col = focusCol.current
    if (!draft || !col) return
    focusCol.current = null
    scrollRef.current
      ?.querySelector<HTMLInputElement>(`input[data-rowid="${CSS.escape(draft.rowId)}"][data-col="${CSS.escape(col)}"]:not(.pj-cell-editor)`)
      ?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.rowId])

  // Focus left an untouched draft (the editor only commits on a real
  // change, so no commit will ever arrive): back to the button.
  useEffect(() => {
    if (!draft || live) return
    const onFocusOut = () => {
      setTimeout(() => {
        const d = draftRef.current
        if (!d || created.current.has(d.rowId) || isDraftFocused()) return
        setDraft(null)
      }, 0)
    }
    document.addEventListener("focusout", onFocusOut)
    return () => document.removeEventListener("focusout", onFocusOut)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.rowId, live])

  /** Commit handler for the draft row's cells. */
  const commit = (edit: CellEdit) => {
    if (edit.rowId == null) return // sheet-level edits never come from a draft row
    if (created.current.has(edit.rowId)) {
      onEdit(edit)
      return
    }
    if (isBlank(edit.value)) return
    created.current.add(edit.rowId)
    onAddRow(edit.rowId, [edit])
  }

  const isDraft = (row: ProjectionRow) => !!draft && !live && row.rowId === draft.rowId

  return { rows, open, commit, isDraft, draftOpen: draft != null && !live }
}

interface AddProjectRowProps {
  label: string
  /** Column keys after Address, in table order (computed ones open Address). */
  slots: AddSlot[]
  /** Open the draft with the cursor under this column. */
  onOpen: (col: string) => void
}

const FADE_IN = { opacity: 1, y: 0 }
const FADE_OUT = { opacity: 0, y: -6 }

/** The add-project line: the table's own last row, reading as ONE full-width
 *  button. Clicking under any column opens the draft row (useDraftRow) with
 *  the cursor already in that column. Unmounted while a draft is open; eases
 *  back in beneath the new row once it exists. */
export function AddProjectRow({ label, slots, onOpen }: AddProjectRowProps) {
  const reduced = useReducedMotion()
  const t = reduced ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const }
  return (
    <motion.tr className="pj-add-tr" initial={FADE_OUT} animate={FADE_IN} transition={t}>
      <td className="pj-sticky" onClick={() => onOpen("address")}>
        <button className="pj-add-row" onClick={(e) => { e.stopPropagation(); onOpen("address") }}>
          <Plus size={10} strokeWidth={2.5} />
          {label}
        </button>
      </td>
      {slots.map((s) => (
        <td
          key={s.key}
          className={`pj-add-cell${s.className ? ` ${s.className}` : ""}`}
          onClick={() => onOpen(s.editable ? s.key : "address")}
          aria-hidden="true"
        />
      ))}
      <td className="pj-gutter" onClick={() => onOpen("address")} />
    </motion.tr>
  )
}

/** Column slots that follow the Address cell in the Unit Projection grid. */
export const GRID_ADD_SLOTS: AddSlot[] = [
  { key: "client", editable: true },
  { key: "name", editable: true },
  { key: "units", className: "pj-zone-start", editable: true },
  { key: "avgUnitPrice", editable: true },
  { key: "total" },
  { key: "pctWin", editable: true },
  { key: "grossMargin", editable: true },
  { key: "cogs" },
  { key: "grossRevenue" },
  { key: "grossProfit" },
  ...MONTH_COLS.map((c, m) => ({ key: c.key, className: m === 0 ? "pj-zone-start" : undefined, editable: true })),
  { key: "unitsScheduled" },
  { key: "unitsRemaining" },
]

/** Same for the Pipeline table (no schedule, no COGS). */
export const PIPELINE_ADD_SLOTS: AddSlot[] = [
  { key: "client", editable: true },
  { key: "name", editable: true },
  { key: "units", className: "pj-zone-start", editable: true },
  { key: "avgUnitPrice", editable: true },
  { key: "total" },
  { key: "pctWin", editable: true },
  { key: "grossMargin", editable: true },
  { key: "grossRevenue" },
  { key: "grossProfit" },
]

interface ProjectionGridProps {
  rows: ProjectionRow[]
  summary: ProjectionSummary
  /** rowId of the most recently added row — the grid scrolls to it, fades it
   *  in with a brief copper wash, and focuses its Address cell. */
  lastAddedRowId?: string | null
  /** A row just awarded from the pipeline (seq bumps per landing). */
  landed?: { rowId: string; seq: number; via: AwardVia } | null
  onEdit: (edit: CellEdit) => void
  onAddRow: (rowId: string, initial: CellEdit[]) => void
  onDeleteRow: (rowId: string) => Promise<void> | void
  /** Drag-rearranged order (every rowId in the section) + the row that moved. */
  onReorder: (order: string[], movedRowId: string) => void
}

export function ProjectionGrid({ rows, summary, lastAddedRowId, landed, onEdit, onAddRow, onDeleteRow, onReorder }: ProjectionGridProps) {
  const { sortKey, sortDir, onSort, clearSort, sorted } = useProjectionSort("grid")
  const ordered = useMemo(() => orderRows(rows, sortKey, sortDir), [rows, sortKey, sortDir])
  const { scrollRef, frameRef, frameClass, scopeClass, onScroll, affordances } = useOverlayScroll(rows.length, `${sortKey}|${sortDir}`)
  const [confirmDelete, setConfirmDelete] = useState<ProjectionRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { expanded, setExpanded } = useCardFullscreen(confirmDelete != null)
  const reducedMotion = useReducedMotion()
  const draft = useDraftRow({ ordered, scrollRef, onAddRow, onEdit })
  const visible = draft.rows

  // A project restored/re-added from elsewhere (undo/redo, not the draft)
  // lands at the bottom: glide there and put the cursor in its Address cell.
  useEffect(() => {
    if (!lastAddedRowId) return
    const el = scrollRef.current
    if (!el) return
    const input = el.querySelector<HTMLInputElement>(
      `tr[data-rowid="${CSS.escape(lastAddedRowId)}"] input[data-col="address"]`
    )
    if (!input) return // the added row belongs to another table (e.g. Pipeline)
    el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" })
    if (!(document.activeElement as HTMLElement | null)?.dataset.col) input.focus({ preventScroll: true })
  }, [lastAddedRowId, reducedMotion, scrollRef])

  // An awarded pipeline project lands at the bottom. The whole landing is
  // optimistic (the row is already in `rows` before the save even starts)
  // and never touches focus. Dropped by hand: the user is already looking
  // here, so only the card's own frame slides to the new row. Sent by the
  // award button: the page glides (slowly) just far enough to show the row
  // and a few above it, then the frame follows. Confetti pops once the
  // scrolling has settled, out of the row's lead cell.
  const drop = useAwardDropTarget()
  const [confetti, setConfetti] = useState<ConfettiOrigin | null>(null)
  useEffect(() => {
    if (!landed) return
    const el = scrollRef.current
    if (!el) return
    const tr = el.querySelector<HTMLTableRowElement>(`tr[data-rowid="${CSS.escape(landed.rowId)}"]`)
    if (!tr) return
    const cancels: Array<() => void> = []
    let done = false
    const pop = () => {
      if (done) return
      done = true
      const lead = tr.querySelector<HTMLElement>("td.pj-sticky") ?? tr
      const r = lead.getBoundingClientRect()
      setConfetti({ x: r.left + Math.min(28, r.width / 2), y: r.top + r.height / 2, seq: landed.seq })
    }
    const frameTop = el.scrollHeight - el.clientHeight
    const frameScroll = (ms: number, then: () => void) =>
      cancels.push(glideTo(el, frameTop, reducedMotion ? 0 : ms, then))

    if (reducedMotion) {
      el.scrollTop = frameTop
      pop()
    } else if (landed.via === "drag") {
      frameScroll(360, pop)
    } else {
      // Page first: only as far as it takes to bring the card's bottom edge
      // (the landed row sits there once the frame follows) into view, so
      // just the last few rows show rather than the whole card.
      const cardBottom = el.getBoundingClientRect().bottom + window.scrollY
      const pageTop = Math.max(window.scrollY, cardBottom + 24 - window.innerHeight)
      cancels.push(glideTo(window, pageTop, PAGE_GLIDE_MS, () => frameScroll(500, pop)))
    }
    return () => {
      done = true
      cancels.forEach((c) => c())
    }
  }, [landed, reducedMotion, scrollRef])
  const rowIds = useMemo(() => ordered.map((r) => r.rowId), [ordered])
  // A drop under a column sort adopts the displayed order (with the row
  // where it landed) as the sheet order, then clears the sort so it shows.
  const reorderAndUnsort = useCallback(
    (order: string[], movedRowId: string) => {
      onReorder(order, movedRowId)
      if (sorted) clearSort()
    },
    [onReorder, sorted, clearSort]
  )

  const renderCells: RenderCells = (row, ri, commit, grip) => {
    const c = computeRow(row)
    return (
      <>
        {IDENTITY_COLS.map((col, i) => (
          <td key={col.key} className={i === 0 ? "pj-sticky" : undefined}>
            {i === 0 && grip && <RowGrip label={row.name || row.address || `row ${ri + 1}`} />}
            <EditableCell row={row} col={col} value={row[col.key as "address"]} rowIndex={ri} onCommit={commit} />
          </td>
        ))}
        <td className="pj-num pj-zone-start"><EditableCell row={row} col={ECON_COLS[0]} value={row.units} rowIndex={ri} onCommit={commit} /></td>
        <td className="pj-num"><EditableCell row={row} col={ECON_COLS[1]} value={row.avgUnitPrice} rowIndex={ri} onCommit={commit} /></td>
        <ComputedCell row={row} field="total" rowIndex={ri}>{c.total ? formatMoneyFull(c.total) : ""}</ComputedCell>
        <td className="pj-num"><EditableCell row={row} col={ECON_COLS[2]} value={row.pctWin} rowIndex={ri} onCommit={commit} /></td>
        <td className="pj-num"><EditableCell row={row} col={ECON_COLS[3]} value={row.grossMargin} rowIndex={ri} onCommit={commit} /></td>
        <ComputedCell row={row} field="cogs" rowIndex={ri}>{fmtPct(c.cogs)}</ComputedCell>
        <ComputedCell row={row} field="grossRevenue" rowIndex={ri}>{c.grossRevenue ? formatMoneyFull(c.grossRevenue) : ""}</ComputedCell>
        <ComputedCell row={row} field="grossProfit" rowIndex={ri}>{c.grossProfit ? formatMoneyFull(c.grossProfit) : ""}</ComputedCell>
        {MONTH_COLS.map((col, m) => (
          <td key={col.key} className={`pj-num pj-month${m === 0 ? " pj-zone-start" : ""}`}>
            <EditableCell row={row} col={col} value={row.months[m] ?? 0} rowIndex={ri} onCommit={commit} />
          </td>
        ))}
        <ComputedCell row={row} field="unitsScheduled" rowIndex={ri}>{fmtInt(c.unitsScheduled)}</ComputedCell>
        <ComputedCell row={row} field="unitsRemaining" rowIndex={ri} className={c.unitsRemaining < 0 ? "pj-negative" : undefined}>
          {fmtInt(c.unitsRemaining)}
        </ComputedCell>
      </>
    )
  }

  // Excel-style vertical travel: Enter or ↑/↓ moves within the column. Tab is
  // native; Escape (handled in the cell) reverts the draft before blurring.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLInputElement
    if (!target.dataset.col) return
    if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault()
      const row = Array.from(
        scrollRef.current?.querySelectorAll<HTMLInputElement>(`input[data-row="${target.dataset.row}"][data-col]:not(.pj-cell-editor)`) ?? []
      )
      const i = row.findIndex((el) => el.dataset.col === target.dataset.col)
      row[i + (e.key === "ArrowLeft" ? -1 : 1)]?.focus()
      return
    }
    let delta = 0
    if (e.key === "Enter" || e.key === "ArrowDown") delta = 1
    else if (e.key === "ArrowUp") delta = -1
    else return
    e.preventDefault()
    const nextRow = Number(target.dataset.row) + delta
    const next = scrollRef.current?.querySelector<HTMLInputElement>(
      `[data-row="${nextRow}"][data-col="${CSS.escape(target.dataset.col)}"]`
    )
    if (next) next.focus()
    else target.blur()
  }

  return (
    <>
    {expanded && <div className="pj-expand-backdrop" aria-hidden="true" onClick={() => setExpanded(false)} />}
    <div
      ref={drop.setNodeRef}
      className={`pj-grid card${expanded ? " pj-grid-expanded" : ""}${drop.awarding ? " pj-grid-award-target" : ""}${drop.over ? " pj-grid-award-over" : ""}`}
    >
      {/* Pin scope: the card head is natively sticky here (see pj-pin-scope
          CSS) and pins the moment the card's top scrolls away; the subtitle
          scrolls under it and fades; the label-row clone in the frame's strip
          pins beneath the head when the real row reaches it. */}
      <div className={scopeClass}>
      <div className="pj-summary-head">
        <div className="pj-summary-title-group">
          <h2 className="widget-title headline"><span className="pj-title-text">Unit Projection</span></h2>
        </div>
        <div className="pj-head-actions">
          <CellFormatBar />
          <button
            className="pj-expand-btn"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Exit full screen" : "View full screen"}
            title={expanded ? "Exit full screen (Esc)" : "Full screen"}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>
      <div className="pj-summary-sub">
        <span className="widget-description">
          Active and awarded projects, scheduled by month · {rows.length} project{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className={frameClass} ref={frameRef}>
      {/* Pinned column labels: a sticky strip anchored at the label row's own
          position that engages under the pinned card head (see pj-pin-strip
          CSS; the clone inside .pj-pin-track is mounted and width-synced by
          useOverlayScroll). The tools band inside it serves full screen only,
          where the card head is hidden. */}
      <div className="pj-pin-bound">
        <div className="pj-pin-rule" aria-hidden="true" />
        <div className="pj-pin-space" aria-hidden="true" />
        <div className="pj-pin-strip">
          <div className="pj-pin-tools">
            <div className="pj-pin-pill pj-pin-pill-name">
              <span className="pj-pin-title">Unit Projection</span>
            </div>
            <div className="pj-pin-pill-group">
              <div className="pj-pin-pill pj-pin-pill-paint">
                <CellFormatBar />
              </div>
              <div className="pj-pin-pill pj-pin-pill-expand">
                <button
                  className="pj-expand-btn"
                  onClick={() => setExpanded((v) => !v)}
                  aria-label={expanded ? "Exit full screen" : "View full screen"}
                  title={expanded ? "Exit full screen (Esc)" : "Full screen"}
                >
                  {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
              </div>
            </div>
          </div>
          <div className="pj-pin-inner">
            <div className="pj-pin-clip">
              <div className="pj-pin-track" aria-hidden="true" onClick={(e) => pinHeaderClick(scrollRef.current, e.target)} />
            </div>
            <div className="pj-pin-addr" aria-hidden="true" onClick={() => pinAddrClick(scrollRef.current)} />
          </div>
        </div>
      </div>
      <div className="pj-grid-scroll" ref={scrollRef} onKeyDown={onKeyDown} onScroll={onScroll}>
        <AwardConfetti origin={confetti} />
        <ActiveCellEditor>
        <RowDragTable section="rows" rowIds={rowIds} onReorder={reorderAndUnsort}>
        <table className="pj-table">
          <thead>
            <tr className="pj-group-row">
              <th className="pj-sticky">Project</th>
              <th colSpan={IDENTITY_COLS.length - 1} />
              <th className="pj-zone-start" colSpan={8}>Economics</th>
              <th className="pj-zone-start" colSpan={14}>Schedule · units per month</th>
              <th className="pj-gutter" />
            </tr>
            <tr>
              {IDENTITY_COLS.map((c, i) => (
                <SortTh key={c.key} col={c.key} label={c.label} className={i === 0 ? "pj-sticky" : undefined} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              ))}
              <SortTh col="units" label="Units" align="right" className="pj-num pj-zone-start" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortTh col="avgUnitPrice" label="Avg Unit Price" align="right" className="pj-num" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortTh col="total" label="Total" align="right" className="pj-num pj-computed-th" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortTh col="pctWin" label="% Win" align="right" className="pj-num" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortTh col="grossMargin" label="Margin" align="right" className="pj-num" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortTh col="cogs" label="COGS" align="right" className="pj-num pj-computed-th" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortTh col="grossRevenue" label="Gross Rev" align="right" className="pj-num pj-computed-th" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortTh col="grossProfit" label="Gross Profit" align="right" className="pj-num pj-computed-th" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              {MONTH_COLS.map((c, m) => (
                <SortTh key={c.key} col={c.key} label={c.label} align="right" className={`pj-num pj-month-th${m === 0 ? " pj-zone-start" : ""}`} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              ))}
              <SortTh col="unitsScheduled" label="Sched" align="right" className="pj-num pj-computed-th" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortTh col="unitsRemaining" label="Unsched" align="right" className="pj-num pj-computed-th" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="pj-gutter" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row, ri) => {
              // The one focal animation here: a fresh row fades in under a
              // copper wash that clears as it settles (.pj-row-new keyframes;
              // the row's transform slot belongs to drag-and-drop).
              const isNew = (row.rowId === lastAddedRowId || row.rowId === landed?.rowId) && !reducedMotion
              const isDraft = draft.isDraft(row)
              return (
                <SortableRow key={row.rowId} rowId={row.rowId} disabled={isDraft} className={isNew ? "pj-row-new" : undefined}>
                  {renderCells(row, ri, isDraft ? draft.commit : onEdit, !isDraft)}
                  <td className="pj-gutter">
                    {!isDraft && <button
                      className="pj-row-delete"
                      aria-label={`Delete row ${row.name || row.address || ri + 1}`}
                      onClick={() => setConfirmDelete(row)}
                    >
                      <Trash2 size={15} />
                    </button>}
                  </td>
                </SortableRow>
              )
            })}
            {!draft.draftOpen && <AddProjectRow label="Add project" slots={GRID_ADD_SLOTS} onOpen={draft.open} />}
          </tbody>
          <tfoot>
            <tr className="pj-totals-row">
              <td className="pj-sticky">Totals</td>
              <td colSpan={2} />
              <td className="pj-num pj-zone-start">{summary.totalUnits}</td>
              <td />
              <td className="pj-num">{formatMoneyFull(summary.totalValue)}</td>
              <td colSpan={3} />
              <td className="pj-num">{formatMoneyFull(summary.totalGrossRevenue)}</td>
              <td className="pj-num">{formatMoneyFull(summary.totalGrossProfit)}</td>
              {summary.unitsByMonth.map((u, m) => (
                <td key={m} className={`pj-num${m === 0 ? " pj-zone-start" : ""}`}>{fmtInt(u)}</td>
              ))}
              <td className="pj-num">{fmtInt(summary.scheduledUnits)}</td>
              <td className="pj-num">{fmtInt(summary.totalUnits - summary.scheduledUnits)}</td>
              <td className="pj-gutter" />
            </tr>
          </tfoot>
        </table>
        </RowDragTable>
        </ActiveCellEditor>
      </div>
      {affordances}
      </div>
      </div>
      <ConfirmModal
        open={confirmDelete != null}
        title={`Delete ${confirmDelete?.address || confirmDelete?.name || "this row"}?`}
        message="This row will be removed from the projection. You can restore it later from a saved version."
        confirmLabel="Delete row"
        danger
        loading={deleting}
        onConfirm={async () => {
          if (!confirmDelete) return
          setDeleting(true)
          try {
            await onDeleteRow(confirmDelete.rowId)
          } finally {
            setDeleting(false)
            setConfirmDelete(null)
          }
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
    </>
  )
}
