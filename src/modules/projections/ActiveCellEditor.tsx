import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import { useReducedMotion } from "framer-motion"
import { createPortal } from "react-dom"
import { useCollab } from "./useProjectionCollab"
import { useCellFormat } from "./CellFormat"
import { styleClass } from "./cellStyles"
import type { CellEdit, CellStyle } from "./types"

/**
 * The active-cell editor: ONE floating chip per grid that glides from cell
 * to cell. It is mounted once, as a child of the grid's scroll container,
 * and stays mounted for the grid's lifetime; opening a cell retargets it,
 * closing fades it out in place. Nothing is ever created or torn down per
 * cell, so there is no presence bookkeeping, no portal per cell, and it is
 * structurally impossible for two chips to exist.
 *
 * Geometry: the chip is absolutely positioned in the scroller's CONTENT
 * coordinates, so the browser scrolls it with the cells on the compositor.
 * Movement between cells is a `transform` tween on the wrapper (compositor
 * only); the wrapper is a zero-width point on the anchor's corner and the
 * body hangs off it leftward (numeric, right-aligned) or rightward (text),
 * so width changes while typing never move the anchored edge.
 *
 * The anchor cell (the read-only input in the table) mirrors the draft
 * imperatively while the chip is open: when the chip tucks under a sticky
 * band the live value is simply there in the sheet.
 */

export type CellKind = "text" | "int" | "money" | "pct" | "unit"

/** Everything the editor needs to know about the cell it's opening. */
export interface CellTarget {
  rowId: string
  field: string
  kind: CellKind
  rowIndex: number
  value: string | number
  styling?: CellStyle
  onCommit: (edit: CellEdit) => void
}

interface EditorHost {
  open: (anchor: HTMLInputElement, target: CellTarget) => void
}

const EditorHostContext = createContext<EditorHost | null>(null)
export const useEditorHost = () => useContext(EditorHostContext)

/** Raw string edited in the chip (pct edits as "22", not "0.22"). */
export function rawValue(kind: CellKind, value: string | number): string {
  if (kind === "text") return String(value)
  const n = Number(value)
  if (kind === "pct") return String(Math.round(n * 1000) / 10)
  return n === 0 ? "" : String(n)
}

export function parseRaw(kind: CellKind, raw: string): string | number {
  if (kind === "text") return raw.trim()
  const cleaned = raw.replace(/[$,%\s,]/g, "")
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return 0
  if (kind === "pct") return Math.min(Math.max(n / 100, 0), 1)
  if (kind === "int") return Math.max(Math.round(n), 0)
  if (kind === "unit") return Math.max(Math.round(n * 1000) / 1000, 0)
  return Math.max(n, 0)
}

/** How far the chip bleeds past its anchor on every side; its padding grows
 *  by the same amount (CSS) so the text stays pixel-aligned over the anchor. */
const EDITOR_BLEED = 4

/** Anchor geometry in the scroller's content space plus the sticky-band
 *  insets used to decide whether the anchor is clear of every edge. */
interface AnchorGeom {
  top: number
  left: number
  width: number
  height: number
  insetLeft: number
  insetRight: number
  insetTop: number
  insetBottom: number
  stickyLead: boolean
  /** Pinned (sticky lead) anchors: the anchor's box in its sticky cell's
   *  own coordinates, which is where the pinned chip is positioned. */
  pinLeft: number
  pinTop: number
  /** The anchor touches the scroller's left edge: the chip's leading bleed
   *  would be clipped by overflow, so the surface is inset there. */
  edgeLeft: boolean
}

function measureAnchor(container: HTMLElement, anchor: HTMLInputElement): AnchorGeom {
  const c = container.getBoundingClientRect()
  const a = anchor.getBoundingClientRect()
  const q = (sel: string) => container.querySelector<HTMLElement>(sel)?.offsetHeight ?? 0
  const qw = (sel: string) => container.querySelector<HTMLElement>(sel)?.offsetWidth ?? 0
  const cell = anchor.closest<HTMLElement>("td, th")
  const stickyLead = !!cell?.classList.contains("pj-sticky")
  const cr = cell?.getBoundingClientRect()
  return {
    pinLeft: cr ? a.left - cr.left : 0,
    pinTop: cr ? a.top - cr.top : 0,
    top: a.top - c.top + container.scrollTop - container.clientTop,
    left: a.left - c.left + container.scrollLeft - container.clientLeft,
    width: a.width,
    height: a.height,
    // From the label row, never the zone-eyebrow row: full screen hides
    // that row, so its lead cell measures 0 and the chip would never tuck.
    insetLeft: stickyLead ? 0 : qw("thead tr:last-child .pj-sticky"),
    insetRight: qw("thead .pj-sticky-right"),
    insetTop: q("thead"),
    // Full screen pins the add-project line above the totals bar; both
    // belong to the bottom band the chip must tuck under.
    insetBottom: q("tfoot") + (container.closest(".pj-grid-expanded") ? q("tbody tr.pj-add-tr") : 0),
    stickyLead,
    edgeLeft: a.left - c.left - container.clientLeft < EDITOR_BLEED,
  }
}

function isClear(g: AnchorGeom, container: HTMLElement, margin = 0): boolean {
  const vl = g.left - container.scrollLeft
  const vt = g.top - container.scrollTop
  const m = margin - 1
  const clearH =
    g.stickyLead || (vl >= g.insetLeft + m && vl + g.width <= container.clientWidth - g.insetRight - m)
  const clearV = vt >= g.insetTop + m && vt + g.height <= container.clientHeight - g.insetBottom - m
  return clearH && clearV
}

const REVEAL_MARGIN = EDITOR_BLEED + 8

/** Scroll offsets that bring the anchor clear of every sticky band. */
function revealOffsets(g: AnchorGeom, container: HTMLElement): { left: number; top: number } {
  let left = container.scrollLeft
  let top = container.scrollTop
  if (!g.stickyLead) {
    const minLeft = g.left - g.insetLeft - REVEAL_MARGIN
    const maxLeft = g.left + g.width - (container.clientWidth - g.insetRight) + REVEAL_MARGIN
    if (left > minLeft) left = minLeft
    else if (left < maxLeft) left = maxLeft
  }
  const minTop = g.top - g.insetTop - REVEAL_MARGIN
  const maxTop = g.top + g.height - (container.clientHeight - g.insetBottom) + REVEAL_MARGIN
  if (top > minTop) top = minTop
  else if (top < maxTop) top = maxTop
  return { left: Math.max(left, 0), top: Math.max(top, 0) }
}

interface Session {
  target: CellTarget
  anchor: HTMLInputElement
  container: HTMLElement
  /** The sticky lead cell hosting the pinned chip (null when not pinned). */
  pinHost: HTMLElement | null
  /** Where the previous chip was on screen (viewport rect) when this
   *  session opened, if a glide across containers is wanted: the pinned
   *  chip is portaled into its cell and the scroller chip into the
   *  scroller, so a move that touches the pinned column remounts the chip
   *  and the transform alone can't carry it. FLIP instead: the new chip
   *  starts where the old one was (measured in viewport space, so the
   *  containers don't matter) and glides home. */
  flipFrom: DOMRect | null
  geom: AnchorGeom
  /** Glide from the previous cell (true) or appear in place (false). */
  glide: boolean
}

// Motion is deliberately NOT used for the chip: its x/y/scale values are
// composed into a transform string on the main thread each frame, so the
// glide stalls whenever React or layout is busy. Plain CSS transitions on
// transform/opacity (App.css .pj-editor-*) run on the compositor thread.

export function ActiveCellEditor({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [draft, setDraft] = useState("")
  // Paint follow-through: `target.styling` is a snapshot from open(), and
  // painting the active cell re-renders the anchor, not this provider. A
  // class observer mirrors the anchor's pj-fill-* onto the chip and its
  // input imperatively (no re-render), and the next open() re-syncs.
  useEffect(() => {
    const anchor = session?.anchor
    if (!anchor) return
    const mo = new MutationObserver(() => {
      const fill = anchor.className.match(/\bpj-fill-[\w-]+/)?.[0]
      for (const el of [chipRef.current, inputRef.current]) {
        if (!el) continue
        for (const c of Array.from(el.classList)) if (c.startsWith("pj-fill-")) el.classList.remove(c)
        if (fill) el.classList.add(fill)
      }
    })
    mo.observe(anchor, { attributes: true, attributeFilter: ["class"] })
    return () => mo.disconnect()
  }, [session])
  const [flush, setFlush] = useState(true)
  const [pinned, setPinned] = useState(false)
  /** Latched (never cleared on close) so the exit fade plays in place. */
  const [pinHost, setPinHost] = useState<HTMLElement | null>(null)
  // Stays visible through the exit tween, then hides so the idle chip costs
  // nothing and can't catch focus.
  const [hidden, setHidden] = useState(true)
  // Imperative mirrors of the session/draft for handlers and effects (kept
  // in sync at every write site, never assigned during render).
  const sessionRef = useRef<Session | null>(null)
  const draftRef = useRef("")
  const anchorRef = useRef<HTMLInputElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLSpanElement>(null)
  const chipRef = useRef<HTMLSpanElement>(null)
  const mirrorRef = useRef<HTMLSpanElement>(null)
  const pad = useRef(0)
  const cancelled = useRef(false)
  const pendingClose = useRef<number | null>(null)
  const revealTarget = useRef<{ left: number; top: number } | null>(null)
  const collab = useCollab()
  const format = useCellFormat()
  const reduced = useReducedMotion()

  /** Commit (or discard) the current session and put the anchor back. */
  const close = useCallback(
    (commit: boolean) => {
      const s = sessionRef.current
      if (!s) return
      const { target, anchor } = s
      if (commit && !cancelled.current) {
        const parsed = parseRaw(target.kind, draftRef.current)
        if (parsed !== target.value) target.onCommit({ rowId: target.rowId, field: target.field, value: parsed })
      }
      cancelled.current = false
      // Hand the anchor its displayed text back. On a real change the row
      // re-renders with the new value right after; this avoids a raw-draft
      // flash in between and is the whole restore when nothing changed.
      anchor.value = anchor.dataset.display ?? anchor.value
      sessionRef.current = null
      anchorRef.current = null
      setSession(null)
      if (reduced) setHidden(true)
      collab?.blurCell()
      // Escape / end-of-column: focus must not linger in the hidden chip.
      const el = inputRef.current
      if (el && document.activeElement === el) el.blur()
    },
    [collab, reduced]
  )

  const open = useCallback(
    (anchor: HTMLInputElement, target: CellTarget) => {
      if (pendingClose.current) {
        clearTimeout(pendingClose.current)
        pendingClose.current = null
      }
      const prev = sessionRef.current
      if (prev && prev.anchor === anchor) {
        inputRef.current?.focus({ preventScroll: true })
        return
      }
      const container = anchor.closest<HTMLElement>(".pj-grid-scroll")
      if (!container) return
      // Measured before close() so the outgoing chip is still where it was.
      const prevRect = prev && bodyRef.current ? bodyRef.current.getBoundingClientRect() : null
      if (prev) {
        close(true)
        // close() may blur the chip, which schedules a deferred close; that
        // must not land on the session we're about to start.
        if (pendingClose.current) {
          clearTimeout(pendingClose.current)
          pendingClose.current = null
        }
      }
      const geom = measureAnchor(container, anchor)
      const reveal = revealOffsets(geom, container)
      const revealing = reveal.left !== container.scrollLeft || reveal.top !== container.scrollTop
      revealTarget.current = revealing ? reveal : null
      if (revealing) container.scrollTo({ ...reveal, behavior: reduced ? "auto" : "smooth" })
      cancelled.current = false
      const pinHost = geom.stickyLead ? anchor.closest<HTMLElement>("td.pj-sticky") : null
      // Every move within one grid glides. Same container (scroller →
      // scroller): the transform transition carries the mounted chip.
      // Anything touching the pinned column remounts the chip in another
      // container, so it glides by FLIP from the outgoing chip's rect. The
      // delta is taken in viewport space before a reveal scroll has moved
      // anything, and the chip then rides the scrolled content, so a reveal
      // (routine in full screen, where the add row widens the bottom inset)
      // composes with the glide instead of cancelling it.
      const sameGrid = prev != null && prev.container === container
      const remounts = sameGrid && prev.pinHost !== pinHost
      const next: Session = {
        target,
        anchor,
        container,
        pinHost,
        geom,
        glide: sameGrid,
        flipFrom: remounts ? prevRect : null,
      }
      sessionRef.current = next
      anchorRef.current = anchor
      draftRef.current = rawValue(target.kind, target.value)
      setDraft(draftRef.current)
      setFlush(revealing || isClear(geom, container))
      setPinned(!!pinHost)
      if (pinHost) setPinHost(pinHost)
      setHidden(false)
      setSession(next)
      collab?.focusCell(target.rowId, target.field)
      format?.setActiveCell({ rowId: target.rowId, field: target.field })
    },
    [close, collab, format, reduced]
  )

  const host = useMemo<EditorHost>(() => ({ open }), [open])

  // Take focus whenever the chip lands on a (new) cell. The anchor that was
  // just focused blurs silently; the chip's own blur is what closes.
  const anchorEl = session?.anchor ?? null
  useLayoutEffect(() => {
    if (!anchorEl) return
    const el = inputRef.current
    if (!el) return
    if (document.activeElement !== el) el.focus({ preventScroll: true })
    el.select()
    el.scrollLeft = 0
    // Padding is constant per chip; read it once per landing.
    const s = getComputedStyle(el)
    pad.current = parseFloat(s.paddingLeft) + parseFloat(s.paddingRight)
  }, [anchorEl])

  // Mirror the draft into the anchor and size the body to the text. The
  // mirror span lives inside the body (inherits the exact font), so this is
  // one layout read of a tiny absolutely positioned subtree, and the width
  // is written straight to the DOM: no second render, no document reflow.
  useLayoutEffect(() => {
    const s = session
    const body = bodyRef.current
    const mirror = mirrorRef.current
    const anchor = anchorRef.current
    if (!s || !body || !mirror || !anchor) return
    anchor.value = draft
    mirror.textContent = draft
    const needed = Math.ceil(mirror.offsetWidth + pad.current + 4)
    body.style.width = `${Math.max(s.geom.width + EDITOR_BLEED * 2, needed)}px`
    const el = inputRef.current
    if (el) el.scrollLeft = 0
  }, [session, draft])

  // Scroll: the chip rides the scroller natively. The only per-scroll work is
  // the flush check (cached numbers vs scrollLeft/Top, coalesced to one rAF,
  // state write only on a flip). Resize/zoom re-measures the anchor once.
  useEffect(() => {
    const s = sessionRef.current
    if (!anchorEl || !s) return
    const { container } = s
    let geom = s.geom
    let raf = 0
    const check = () => {
      raf = 0
      const target = revealTarget.current
      if (target) {
        if (Math.abs(container.scrollLeft - target.left) > 1 || Math.abs(container.scrollTop - target.top) > 1) return
        revealTarget.current = null
      }
      const next = isClear(geom, container)
      setFlush((prev) => (prev === next ? prev : next))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check)
    }
    const remeasure = () => {
      const cur = sessionRef.current
      if (!cur || cur.anchor !== anchorEl) return
      geom = measureAnchor(container, cur.anchor)
      const next = { ...cur, geom, glide: false, flipFrom: null }
      sessionRef.current = next
      setSession(next)
      onScroll()
    }
    container.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", remeasure)
    // observe() always delivers one initial notification: skip it, or every
    // landing would immediately remeasure and cut the glide short.
    let primed = false
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (primed) remeasure()
            primed = true
          })
        : null
    ro?.observe(container)
    return () => {
      container.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", remeasure)
      ro?.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [anchorEl])

  // If the anchor leaves the DOM mid-edit (row removed, reorder, reload),
  // commit and let go rather than stranding a session on a dead node.
  useEffect(() => {
    const s = sessionRef.current
    if (!anchorEl || !s) return
    const obs = new MutationObserver(() => {
      if (!anchorEl.isConnected) close(true)
    })
    obs.observe(s.container, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [anchorEl, close])

  const onBlur = () => {
    // The window itself lost focus (app switch, another window, devtools):
    // the cell stays active, and the input takes focus back when the window
    // returns (see the focus listener below). Only an in-page blur closes.
    if (!document.hasFocus()) return
    // Focus is mid-flight: a click or nav onto another anchor calls open()
    // synchronously after this and cancels the close.
    if (pendingClose.current) clearTimeout(pendingClose.current)
    pendingClose.current = window.setTimeout(() => {
      pendingClose.current = null
      close(true)
    }, 0)
  }

  // Window regains focus with a live session: put the caret back in the
  // chip (browsers usually restore it, but not after focus moved elsewhere
  // in the page while the window was inactive).
  useEffect(() => {
    if (!anchorEl) return
    const onFocus = () => {
      const el = inputRef.current
      if (sessionRef.current && el && document.activeElement !== el) el.focus({ preventScroll: true })
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [anchorEl])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const s = sessionRef.current
    if (!s) return
    const { container, target } = s
    if (e.key === "Escape") {
      e.stopPropagation()
      cancelled.current = true
      close(false)
    } else if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
      // Excel-style vertical travel. Consumed here so the grid's own anchor
      // nav handler never also fires for the same press.
      e.preventDefault()
      e.stopPropagation()
      const delta = e.key === "ArrowUp" ? -1 : 1
      const next = container.querySelector<HTMLInputElement>(
        `input[data-row="${target.rowIndex + delta}"][data-col="${CSS.escape(target.field)}"]:not(.pj-cell-editor)`
      )
      if (next) next.focus()
      else close(true)
    } else if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      // Shift+Left/Right: sideways travel along the row (plain Left/Right
      // keep moving the caret). Stays on the row: no wrap at either end.
      e.preventDefault()
      e.stopPropagation()
      const row = Array.from(
        container.querySelectorAll<HTMLInputElement>(`input[data-row="${target.rowIndex}"][data-col]:not(.pj-cell-editor)`)
      )
      const i = row.findIndex((el) => el.dataset.col === target.field)
      const next = row[i + (e.key === "ArrowLeft" ? -1 : 1)]
      if (next) next.focus()
    } else if (e.key === "Tab") {
      e.preventDefault()
      const anchors = Array.from(container.querySelectorAll<HTMLInputElement>("input[data-col]:not(.pj-cell-editor)"))
      const i = anchors.findIndex((el) => el.dataset.row === String(target.rowIndex) && el.dataset.col === target.field)
      const next = anchors[i + (e.shiftKey ? -1 : 1)]
      if (next) next.focus()
      else close(true)
    }
  }

  // Pinned-column mode (the sticky Address cell): the chip cannot live in
  // the scroller's content space, where it would ride away under horizontal
  // scroll while the cell stays put. That session portals the chip INTO the
  // sticky cell itself (position: sticky is a containing block for absolute
  // children), positioned in the cell's own coordinates: the browser then
  // moves it with the cell on the compositor, frame-exact. The chip's own
  // z-index is capped by the cell's stacking context, so the lift over the
  // header / totals bands is done on the CELL: .pj-sticky-lifted raises the
  // host td above the bands while the anchor is clear of them, and drops it
  // back (so the chip tucks under like any cell) the moment it isn't.
  const shown = !!session && flush
  // FLIP for a move that remounted the chip (into or out of the pinned
  // column, or between two pinned cells): the new chip is placed where the
  // old one was on screen with no transition, that frame is committed, and
  // it's released so the glide transition (the same 140ms as the grid)
  // carries it home. Viewport-space delta, so the containers don't matter.
  useLayoutEffect(() => {
    const el = chipRef.current
    const s = session
    if (!el || !s || !s.flipFrom || !s.glide || reduced) return
    const body = bodyRef.current
    if (!body) return
    // Compare the visible bodies by their leading edge (text chips hang
    // right off the anchor's left edge, numeric ones hang left off its right).
    const here = body.getBoundingClientRect()
    const numeric = s.target.kind !== "text"
    const dx = numeric ? s.flipFrom.right - here.right : s.flipFrom.left - here.left
    const dy = s.flipFrom.top - here.top
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
    const x = (s.pinHost ? s.geom.pinLeft : s.geom.left) + (numeric ? s.geom.width + EDITOR_BLEED : -EDITOR_BLEED)
    const y = (s.pinHost ? s.geom.pinTop : s.geom.top) - EDITOR_BLEED
    el.style.transition = "none"
    el.style.transform = `translate3d(${x + dx}px, ${y + dy}px, 0)`
    void el.offsetWidth // commit the start frame
    el.style.transition = ""
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`
  }, [session, reduced])
  useLayoutEffect(() => {
    const host = pinHost
    if (!host) return
    host.classList.toggle("pj-sticky-lifted", pinned && shown)
    return () => host.classList.remove("pj-sticky-lifted")
  }, [pinHost, pinned, shown])

  // The exit plays in place: once the session clears, the chip keeps the
  // last session's geometry (position, size, hang direction) while the
  // surface scales down and fades, and only loses it when hidden lands.
  // Without this the wrapper collapses to the origin at height 0 on close
  // and the chip simply vanishes.
  const lastRef = useRef<Session | null>(null)
  if (session) lastRef.current = session
  const view = session ?? (hidden ? null : lastRef.current)
  const g = view?.geom
  const numeric = view ? view.target.kind !== "text" : false
  // Wrapper = a point on the anchor's leading corner (right edge for numeric
  // cells, left for text), lifted by the bleed. Content coordinates.
  const x = g ? (pinned ? g.pinLeft : g.left) + (numeric ? g.width + EDITOR_BLEED : -EDITOR_BLEED) : 0
  const y = g ? (pinned ? g.pinTop : g.top) - EDITOR_BLEED : 0
  const glide = !!session?.glide && !reduced
  const wrapperStyle = {
    transform: `translate3d(${x}px, ${y}px, 0)`,
    height: g ? g.height + EDITOR_BLEED * 2 : 0,
    visibility: hidden ? "hidden" : "visible",
  } as CSSProperties
  const styleCls = styleClass(view?.target.styling)
  const chipClass =
    "pj-editor-chip" +
    (shown ? " pj-editor-shown pj-editor-lifted" : "") +
    (glide ? " pj-editor-glide" : "") +
    (reduced ? " pj-editor-instant" : "") +
    (pinned ? " pj-editor-pinned" : "") +
    (g?.edgeLeft ? " pj-editor-edge-left" : "") +
    styleCls

  const chip = (
      <span ref={chipRef} className={chipClass} style={wrapperStyle}>
        <span ref={bodyRef} className={`pj-editor-body${numeric ? " pj-editor-body-num" : ""}`}>
          <span
            className="pj-editor-surface"
            onTransitionEnd={(e) => {
              if (e.propertyName === "opacity" && !sessionRef.current) setHidden(true)
            }}
            aria-hidden
          />
          <span ref={mirrorRef} className="pj-editor-mirror" aria-hidden />
          <input
            ref={inputRef}
            className={`pj-cell-input pj-cell-editor${session ? ` pj-kind-${session.target.kind}` : ""}${numeric ? " pj-editor-num" : ""}${styleCls}`}
            data-row={session?.target.rowIndex}
            data-col={session?.target.field}
            value={draft}
            tabIndex={session ? 0 : -1}
            style={{ pointerEvents: session ? "auto" : "none" }}
            onChange={(e) => {
              const v = e.currentTarget.value
              draftRef.current = v
              setDraft(v)
              const s = sessionRef.current
              if (s) collab?.previewCell(s.target.rowId, s.target.field, v)
            }}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            spellCheck={false}
          />
        </span>
      </span>
  )

  return (
    <EditorHostContext.Provider value={host}>
      {children}
      {pinned && pinHost ? createPortal(chip, pinHost) : chip}
    </EditorHostContext.Provider>
  )
}
