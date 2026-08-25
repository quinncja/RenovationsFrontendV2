import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"

/* ── Award confetti ──
   A small burst that pops out of a row the moment it lands in the Unit
   Projection grid (drag-drop or the gutter's award arrow). Pure CSS motion:
   each piece is one absolutely-placed span driven by custom properties
   (.pj-confetti-piece keyframes in App.css), portaled to body so no scroll
   frame clips it. Nothing here waits on the network — the burst is part of
   the optimistic landing. Reduced motion: no burst at all. ──────────── */

export interface ConfettiOrigin {
  /** Viewport coordinates of the burst origin. */
  x: number
  y: number
  /** Bumped per burst so the same spot can pop twice (undo → redo). */
  seq: number
}

const PIECES = 28
const LIFE_MS = 1700
/* Copper is the meaning ("this became a real project"); the rest keeps the
   burst from reading as one orange blob. */
const COLORS = ["#c27c3e", "#d99a5b", "#e8c79a", "#8a7f74", "#3a3632", "#f1e4d2"]

interface Piece {
  style: CSSProperties
}

function makePieces(seed: number): Piece[] {
  // Deterministic per burst so a re-render mid-flight can't reshuffle it.
  let s = seed * 9301 + 49297
  const rand = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  return Array.from({ length: PIECES }, (_, i) => {
    // Fan upward and to the right, the way a row "pops" out of its lead cell.
    const angle = (-165 + rand() * 150) * (Math.PI / 180)
    const dist = 52 + rand() * 110
    const w = 4 + rand() * 4
    const h = w * (0.55 + rand() * 0.9)
    return {
      style: {
        "--dx": `${Math.cos(angle) * dist}px`,
        "--dy": `${Math.sin(angle) * dist}px`,
        "--rot": `${(rand() - 0.5) * 900}deg`,
        "--delay": `${Math.floor(rand() * 140)}ms`,
        width: `${w}px`,
        height: `${h}px`,
        background: COLORS[i % COLORS.length],
        borderRadius: rand() > 0.6 ? "999px" : "1px",
      } as CSSProperties,
    }
  })
}

/** Renders one burst at `origin`; it clears itself once the pieces have faded. */
export function AwardConfetti({ origin }: { origin: ConfettiOrigin | null }) {
  // Derived, not mirrored: the burst is live until its seq has been retired.
  const [retiredSeq, setRetiredSeq] = useState<number | null>(null)
  const live = origin && origin.seq !== retiredSeq ? origin : null
  useEffect(() => {
    if (!live) return
    const seq = live.seq
    const t = setTimeout(() => setRetiredSeq(seq), LIFE_MS + 80)
    return () => clearTimeout(t)
  }, [live])
  const pieces = useMemo(() => (live ? makePieces(live.seq) : []), [live])
  if (!live) return null
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null
  return createPortal(
    <div className="pj-confetti" style={{ left: live.x, top: live.y }} aria-hidden="true">
      {pieces.map((p, i) => (
        <span key={`${live.seq}-${i}`} className="pj-confetti-piece" style={p.style} />
      ))}
    </div>,
    document.body
  )
}
