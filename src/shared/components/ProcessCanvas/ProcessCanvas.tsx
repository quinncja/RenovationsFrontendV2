import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Minus, Plus, Maximize2, Minimize2, Scan } from "lucide-react"
import { useCardFullscreen } from "../../../modules/projections/useOverlayScroll"

/* ------------------------------------------------------------------
   ProcessCanvas: the Figma-style pan + zoom viewport first built for
   the Project Process page, shared with any page that lays a diagram
   out in absolute "world" pixels. Scroll pans, pinch / ⌘+scroll zooms
   at the cursor, drag moves, Fit re-centres the content bounds.
   ------------------------------------------------------------------ */

export interface CanvasBounds {
  x0: number
  y0: number
  x1: number
  y1: number
}

interface Props {
  worldW: number
  worldH: number
  /** Tight content bounds used by Fit. */
  bounds: CanvasBounds
  /** Re-fit when this changes (e.g. the diagram was re-laid out). */
  fitKey?: unknown
  children: ReactNode
  /** Rendered inside the viewport, above the world (loading states, empties). */
  overlay?: ReactNode
}

const MIN_Z = 0.25
const MAX_Z = 4

/** Polyline with rounded corners. */
export function roundedPath(pts: [number, number][], r = 5): string {
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1]
    const inL = Math.hypot(cx - px, cy - py), outL = Math.hypot(nx - cx, ny - cy)
    const rr = Math.min(r, inL / 2, outL / 2)
    const ax = cx - ((cx - px) / inL) * rr, ay = cy - ((cy - py) / inL) * rr
    const bx = cx + ((nx - cx) / outL) * rr, by = cy + ((ny - cy) / outL) * rr
    d += ` L ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`
  }
  const [lx, ly] = pts[pts.length - 1]
  return d + ` L ${lx} ${ly}`
}

export function useProcessCanvas({ worldW, worldH, bounds, fitKey }: Omit<Props, "children" | "overlay">) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ x: 0, y: 0, z: 1 })
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [smooth, setSmooth] = useState(false)
  const { expanded, setExpanded } = useCardFullscreen(false)
  const { x0, y0, x1, y1 } = bounds

  const fit = useCallback((animate = false) => {
    const el = viewportRef.current
    if (!el) return
    const pad = 24
    const spanW = x1 - x0, spanH = y1 - y0
    const z = Math.min((el.clientWidth - pad * 2) / spanW, (el.clientHeight - pad * 2) / spanH, 2)
    if (animate) setSmooth(true)
    setView({ z, x: (el.clientWidth - spanW * z) / 2 - x0 * z, y: (el.clientHeight - spanH * z) / 2 - y0 * z })
  }, [x0, y0, x1, y1])

  // Initial fit needs the viewport's measured size, so it runs post-mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fit() }, [fit, fitKey])
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(() => fit())
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])

  /** Keep at least a sliver of the world inside the viewport. */
  const clamp = useCallback((v: { x: number; y: number; z: number }) => {
    const el = viewportRef.current
    if (!el) return v
    const m = 120
    const x = Math.min(el.clientWidth - m - x0 * v.z, Math.max(m - worldW * v.z, v.x))
    const y = Math.min(el.clientHeight - m, Math.max(m - worldH * v.z, v.y))
    return { ...v, x, y }
  }, [worldW, worldH, x0])

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number, animate = false) => {
    setSmooth(animate)
    setView(v => {
      const el = viewportRef.current
      const px = cx ?? (el ? el.clientWidth / 2 : 0)
      const py = cy ?? (el ? el.clientHeight / 2 : 0)
      const z = Math.min(MAX_Z, Math.max(MIN_Z, v.z * factor))
      const k = z / v.z
      return clamp({ z, x: px - (px - v.x) * k, y: py - (py - v.y) * k })
    })
  }, [clamp])

  // Wheel: pinch / ctrl+wheel zooms at cursor, plain wheel pans (Figma).
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top)
      } else {
        setSmooth(false)
        setView(v => clamp({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [zoomAt, clamp])

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
    setDragging(true)
    setSmooth(false)
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    setView(v => clamp({ ...v, x: d.vx + (e.clientX - d.x), y: d.vy + (e.clientY - d.y) }))
  }
  function onPointerUp() { drag.current = null; setDragging(false) }

  const controls = (
    <div className="pj-header-actions">
      <div className="pj-history-btn pp-zoom" role="group" aria-label="Zoom">
        <button type="button" className="pp-zoom-btn" onClick={() => zoomAt(1 / 1.25, undefined, undefined, true)} aria-label="Zoom out"><Minus size={14} /></button>
        <span className="pp-zoom-level">{Math.round(view.z * 100)}%</span>
        <button type="button" className="pp-zoom-btn" onClick={() => zoomAt(1.25, undefined, undefined, true)} aria-label="Zoom in"><Plus size={14} /></button>
      </div>
      <button className="pj-history-btn pp-fit-btn" onClick={() => fit(true)}>
        <Scan size={14} />
        Fit
      </button>
      <button
        className="pj-expand-btn"
        onClick={() => setExpanded(v => !v)}
        aria-label={expanded ? "Exit full screen" : "View full screen"}
        title={expanded ? "Exit full screen (Esc)" : "Full screen"}
      >
        {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>
    </div>
  )

  const canvas = (children: ReactNode, overlay?: ReactNode) => (
    <>
      {expanded && <div className="pj-expand-backdrop" onClick={() => setExpanded(false)} />}
      <div
        ref={viewportRef}
        className={`pp-viewport${dragging ? " pp-viewport--dragging" : ""}${expanded ? " pp-viewport--expanded" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {expanded && (
          <div className="pp-expanded-actions" onPointerDown={e => e.stopPropagation()}>
            {controls}
          </div>
        )}
        <div
          className={`pp-world${smooth ? " pp-world--smooth" : ""}`}
          style={{ width: worldW, height: worldH, transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}
        >
          {children}
        </div>
        {overlay}
      </div>
    </>
  )

  return { controls, canvas, expanded }
}
