import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  useReducedMotion,
  animate,
} from "framer-motion"

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94]

// Geometry. The hole carries PAD of breathing room around the taught element;
// clip-path and the ring/shield share the same padded rect so they never drift.
const PAD = 6
const RADIUS = 10 // matches the small pill buttons this teaches
const CARD_W = 280
const GAP = 14 // hint card offset from the hole
const MARGIN = 12 // viewport clamp
const SNAP = 2 // sub-pixel drift tracks directly; larger moves animate
const TRAVEL = 0.5 // cutout travel on a target switch

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

function holeOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect()
  return { x: r.left - PAD, y: r.top - PAD, w: r.width + 2 * PAD, h: r.height + 2 * PAD }
}

// Evenodd path: an outer viewport rect plus an inner rounded-rect hole. A
// collapsed hole (no target) drops to the outer rect only — full blur.
function clipPath(vw: number, vh: number, x: number, y: number, w: number, h: number): string {
  const outer = `M0 0 H${vw} V${vh} H0 Z`
  if (w <= 1 || h <= 1) return `path("${outer}")`
  const r = Math.max(0, Math.min(RADIUS, w / 2, h / 2))
  const x0 = Math.round(x)
  const y0 = Math.round(y)
  const x1 = Math.round(x + w)
  const y1 = Math.round(y + h)
  const inner =
    `M${x0 + r} ${y0} H${x1 - r} A${r} ${r} 0 0 1 ${x1} ${y0 + r} ` +
    `V${y1 - r} A${r} ${r} 0 0 1 ${x1 - r} ${y1} ` +
    `H${x0 + r} A${r} ${r} 0 0 1 ${x0} ${y1 - r} ` +
    `V${y0 + r} A${r} ${r} 0 0 1 ${x0 + r} ${y0} Z`
  return `path(evenodd, "${outer} ${inner}")`
}

interface CardPos {
  left: number
  top: number
  below: boolean
  arrowLeft: number
}

function placeCard(hole: Rect, cardH: number, vpW: number, vpH: number): CardPos {
  const centerX = hole.x + hole.w / 2
  const left = Math.max(MARGIN, Math.min(centerX - CARD_W / 2, vpW - CARD_W - MARGIN))
  const belowTop = hole.y + hole.h + GAP
  const below = belowTop + cardH + MARGIN <= vpH
  const top = below ? belowTop : Math.max(MARGIN, hole.y - GAP - cardH)
  const arrowLeft = Math.max(14, Math.min(centerX - left, CARD_W - 14))
  return { left, top, below, arrowLeft }
}

export interface CoachmarkProps {
  /** Element being taught. May be null while active (backdrop only, no cutout/hint yet). */
  target: HTMLElement | null
  active: boolean
  title?: string
  body: ReactNode
  /** Advance button label; default "Got it". */
  ctaLabel?: string
  onAdvance: () => void
  /** Quiet progress dots rendered in the hint card (index is 0-based). */
  progress?: { index: number; count: number }
}

/**
 * Anchored coachmark: one persistent blurred backdrop (like DailyReportCoach's
 * .rpt-coach) with a rounded cutout over `target` so the real control shows crisp
 * through the blur — no z-index lifting, no marker class on the target. The
 * cutout animates between targets while the backdrop stays mounted; a hint card
 * anchors near it. The cutout would let clicks reach the real control, so an
 * invisible shield covers the hole — the only way forward is the card's CTA.
 * Non-dismissing: backdrop clicks do nothing.
 */
export function Coachmark({ target, active, title, body, ctaLabel, onAdvance, progress }: CoachmarkProps) {
  const reduced = !!useReducedMotion()

  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const mw = useMotionValue(0)
  const mh = useMotionValue(0)
  const vw = useMotionValue(typeof window === "undefined" ? 0 : window.innerWidth)
  const vh = useMotionValue(typeof window === "undefined" ? 0 : window.innerHeight)

  const clip = useTransform(() => clipPath(vw.get(), vh.get(), mx.get(), my.get(), mw.get(), mh.get()))

  const animatingRef = useRef(false)
  const initedRef = useRef(false)

  // Card placement is React state (needs the measured card height for flip); it
  // is committed only on a jump/switch, not on sub-pixel tracking, so idle drift
  // never re-renders. `stepKey` keys the card so a target switch fades it out/in.
  const [hole, setHole] = useState<Rect | null>(null)
  const [vp, setVp] = useState(() => ({
    w: typeof window === "undefined" ? 0 : window.innerWidth,
    h: typeof window === "undefined" ? 0 : window.innerHeight,
  }))
  const [cardH, setCardH] = useState(140)
  const [stepKey, setStepKey] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)

  // A fresh target while active is a step advance — re-key the card. Set during
  // render (the supported reset-on-change pattern) so the exiting card never
  // paints a frame against the new target's props.
  const [prevTarget, setPrevTarget] = useState<HTMLElement | null>(null)
  if (target !== prevTarget) {
    setPrevTarget(target)
    if (active && target) setStepKey((k) => k + 1)
  }

  useEffect(() => {
    const onResize = () => {
      vw.set(window.innerWidth)
      vh.set(window.innerHeight)
      setVp({ w: window.innerWidth, h: window.innerHeight })
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [vw, vh])

  // Measure-after-paint for the flip decision; deliberately dep-free (the card's
  // content changes with the step) and self-quenching via the >1px guard.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight
    if (h && Math.abs(h - cardH) > 1) setCardH(h)
  })

  // Live rect tracking. The dashboard under the blur loads widgets async, so the
  // target moves after mount: snap tiny corrections, animate large jumps (a
  // target switch or a big reflow). One element, so the rAF loop is cheap.
  useEffect(() => {
    if (!active) {
      initedRef.current = false
      return
    }
    const snap4 = (r: Rect) => {
      mx.set(r.x)
      my.set(r.y)
      mw.set(r.w)
      mh.set(r.h)
    }
    const jump = (r: Rect) => {
      animatingRef.current = true
      const opts = { duration: TRAVEL, ease: EASE }
      animate(mx, r.x, opts)
      animate(my, r.y, opts)
      animate(mw, r.w, opts)
      animate(mh, r.h, { ...opts, onComplete: () => (animatingRef.current = false) })
    }
    const collapse = () => {
      const cx = mx.get() + mw.get() / 2
      const cy = my.get() + mh.get() / 2
      if (reduced) {
        mx.set(cx)
        my.set(cy)
        mw.set(0)
        mh.set(0)
        return
      }
      animatingRef.current = true
      const opts = { duration: TRAVEL, ease: EASE }
      animate(mx, cx, opts)
      animate(my, cy, opts)
      animate(mw, 0, opts)
      animate(mh, 0, { ...opts, onComplete: () => (animatingRef.current = false) })
    }

    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (animatingRef.current) return
      if (target) {
        const r = holeOf(target)
        if (!initedRef.current) {
          snap4(r)
          initedRef.current = true
          setHole(r)
        } else {
          const d = Math.max(
            Math.abs(mx.get() - r.x),
            Math.abs(my.get() - r.y),
            Math.abs(mw.get() - r.w),
            Math.abs(mh.get() - r.h)
          )
          if (d <= SNAP) {
            snap4(r)
          } else if (reduced) {
            snap4(r)
            setHole(r)
          } else {
            jump(r)
            setHole(r)
          }
        }
      } else if (initedRef.current && mw.get() > 1) {
        collapse()
        setHole(null)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [active, target, reduced, mx, my, mw, mh])

  const pos = hole ? placeCard(hole, cardH, vp.w, vp.h) : null

  return createPortal(
    <AnimatePresence>
      {active && (
        <motion.div
          className="coach-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.2 : 0.4, ease: EASE }}
        >
          <motion.div
            className="coach-backdrop"
            style={{ clipPath: clip, WebkitClipPath: clip }}
          />

          {/* Invisible shield over the hole: the cutout would pass clicks through
              to the real control, so this swallows them. Also carries the pulse. */}
          {target && hole && (
            <motion.div
              className="coach-ring"
              style={{ x: mx, y: my, width: mw, height: mh, left: 0, top: 0 }}
            />
          )}

          <AnimatePresence mode="wait">
            {pos && (
              <motion.div
                key={stepKey}
                ref={cardRef}
                className="coach-card"
                style={{ left: pos.left, top: pos.top }}
                initial={{ opacity: 0, y: reduced ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduced ? 0 : 4 }}
                transition={{ duration: reduced ? 0.15 : 0.35, ease: EASE }}
              >
                <span className={`coach-card-arrow coach-card-arrow--${pos.below ? "below" : "above"}`} style={{ left: pos.arrowLeft }} />
                {title && <div className="coach-card-title">{title}</div>}
                <div className="gear-hint-body">{body}</div>
                <button type="button" className="gear-hint-dismiss" onClick={onAdvance}>
                  {ctaLabel ?? "Got it"}
                </button>
                {progress && (
                  <div className="coach-dots" aria-hidden="true">
                    {Array.from({ length: progress.count }, (_, i) => (
                      <span key={i} className={`coach-dot${i === progress.index ? " coach-dot--on" : ""}`} />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
