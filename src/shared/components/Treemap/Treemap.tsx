import { useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { formatMoney } from "../../utils/format"
import { SERIES_PALETTE } from "../../config/chartColors"

// Generic treemap visualization: a custom squarified layout rendered as HTML
// tiles, so the tiles can carry the app's card language (rounded corners,
// soft inner highlight, hover affordance) that an SVG chart library can't.
// Size encodes magnitude; color's job is just to make each tile individually
// identifiable, with direct labels + value/share printed on tiles large
// enough to hold them and a cursor tooltip covering the rest.

export interface TreemapItem {
  id: string
  label: string
  value: number
}

interface TreemapProps {
  items: TreemapItem[]
  totalSum: number
  /** Kept for API compatibility with the old nivo wrapper; unused now that
   *  the root level isn't rendered. */
  rootName?: string
  /** Optional click handler — called with the item id. */
  onNodeClick?: (id: string) => void
}

// The tiles wear the dashboard's shared categorical family (SERIES_PALETTE —
// same depth as the donut and multi-line charts) so the treemap reads as one
// system with the rest of the graphs. The cycle is REORDERED for treemap
// adjacency: size-rank neighbors sit next to each other on screen, and this
// permutation was searched against the CVD/normal-vision separation checks
// (worst adjacent pair deutan ΔE 8.3, normal 22.1 — both passing; the shared
// hues themselves are the fixed design-system parameter). Assigned by size
// rank in fixed order — a 13th item reuses the cycle, but by then tiles are
// slivers identified by tooltip, not color.
const PALETTE = [0, 1, 5, 9, 8, 6, 3, 2, 10, 7, 4, 11].map((i) => SERIES_PALETTE[i])

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

// Standard squarified treemap (Bruls et al.): values must arrive sorted
// descending; rows are laid along the short side while adding the next tile
// keeps the row's worst aspect ratio improving.
function squarify(values: number[], width: number, height: number): Rect[] {
  const total = values.reduce((s, v) => s + v, 0)
  if (total <= 0 || width <= 0 || height <= 0) return values.map(() => ({ x: 0, y: 0, w: 0, h: 0 }))
  const scale = (width * height) / total
  const areas = values.map((v) => v * scale)
  const rects: Rect[] = []
  let x = 0, y = 0, w = width, h = height
  let i = 0
  while (i < areas.length) {
    const side = Math.min(w, h)
    let row = [areas[i]]
    let rowSum = areas[i]
    let worst = worstRatio(row, rowSum, side)
    i++
    while (i < areas.length) {
      const nextSum = rowSum + areas[i]
      const nextWorst = worstRatio([...row, areas[i]], nextSum, side)
      if (nextWorst > worst) break
      row.push(areas[i])
      rowSum = nextSum
      worst = nextWorst
      i++
    }
    const thickness = side > 0 ? rowSum / side : 0
    let offset = 0
    for (const area of row) {
      const len = thickness > 0 ? area / thickness : 0
      if (w >= h) rects.push({ x, y: y + offset, w: thickness, h: len })
      else rects.push({ x: x + offset, y, w: len, h: thickness })
      offset += len
    }
    if (w >= h) { x += thickness; w -= thickness }
    else { y += thickness; h -= thickness }
  }
  return rects
}

function worstRatio(row: number[], sum: number, side: number): number {
  const max = Math.max(...row)
  const min = Math.min(...row)
  const s2 = sum * sum
  const side2 = side * side
  return Math.max((side2 * max) / s2, s2 / (side2 * min))
}

// Gap between tiles: the modal surface showing through does the separating,
// instead of a drawn border grid.
const GUTTER = 4

interface Hover {
  item: TreemapItem
  color: string
  cx: number
  cy: number
}

export function Treemap({ items, totalSum, onNodeClick }: TreemapProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const plotted = items.filter((i) => (i.value ?? 0) > 0).sort((a, b) => b.value - a.value)

  if (items.length === 0 || plotted.length === 0) {
    return <div className="treemap-empty body-text text-secondary">No items to display</div>
  }

  const rects = size ? squarify(plotted.map((i) => i.value), size.w, size.h) : []

  return (
    <div ref={hostRef} className="treemap-canvas">
      {size &&
        plotted.map((item, i) => {
          const r = rects[i]
          const w = Math.max(0, r.w - GUTTER)
          const h = Math.max(0, r.h - GUTTER)
          if (w < 1 || h < 1) return null
          const tile = PALETTE[i % PALETTE.length]
          const pct = totalSum > 0 ? (item.value / totalSum) * 100 : 0
          // What fits: name + value + share on big tiles, name + value on
          // medium ones, name alone on small ones, nothing on slivers.
          const showValue = w >= 76 && h >= 44
          const showPct = w >= 96 && h >= 68
          const showName = w >= 44 && h >= 20
          return (
            <div
              key={item.id}
              className={`treemap-tile${onNodeClick ? " treemap-tile--click" : ""}`}
              style={{
                left: r.x + GUTTER / 2,
                top: r.y + GUTTER / 2,
                width: w,
                height: h,
                ["--tile" as string]: tile,
              }}
              role={onNodeClick ? "button" : undefined}
              tabIndex={onNodeClick ? 0 : undefined}
              onClick={onNodeClick ? () => onNodeClick(item.id) : undefined}
              onKeyDown={onNodeClick ? (e) => e.key === "Enter" && onNodeClick(item.id) : undefined}
              onMouseEnter={(e) => setHover({ item, color: tile, cx: e.clientX, cy: e.clientY })}
              onMouseMove={(e) => setHover({ item, color: tile, cx: e.clientX, cy: e.clientY })}
              onMouseLeave={() => setHover(null)}
            >
              {showName && (
                <div className="treemap-tile-text">
                  <span className="treemap-tile-name">{item.label}</span>
                  {showValue && <span className="treemap-tile-value">{formatMoney(item.value)}</span>}
                  {showPct && <span className="treemap-tile-pct">{pct.toFixed(1)}% of total</span>}
                </div>
              )}
            </div>
          )
        })}
      {hover &&
        createPortal(
          <div
            className="treemap-tooltip card"
            style={{
              position: "fixed",
              zIndex: 9999,
              pointerEvents: "none",
              left: Math.min(hover.cx + 14, window.innerWidth - 220),
              top: Math.min(hover.cy + 16, window.innerHeight - 110),
              transition: "left 80ms ease-out, top 80ms ease-out",
            }}
          >
            <div className="treemap-tooltip-head">
              <span className="treemap-tooltip-swatch" style={{ background: hover.color }} />
              <span className="treemap-tooltip-name body-text emphasized">{hover.item.label}</span>
            </div>
            <div className="treemap-tooltip-value title1 emphasized">{formatMoney(hover.item.value)}</div>
            <div className="treemap-tooltip-pct subheadline text-secondary">
              {totalSum > 0 ? ((hover.item.value / totalSum) * 100).toFixed(1) : "0"}% of total
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
