import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { useCoachTarget, type CoachTargetId } from "./coachTargets"

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94]
const GAP = 12 // card offset from the nav item (matches NavReportsHint)

export interface NavSectionHintProps {
  /** Nav element the hint anchors to (right side, vertically centered). */
  targetId: CoachTargetId
  /** Whether the milestone is owed — the owner resolves seen()/phase gating. */
  active: boolean
  /** Transiently covered (a nav flyout opens over the same anchor area): fade
   *  out without dismissing, back in when the flyout closes. */
  veiled?: boolean
  title: string
  body: ReactNode
  onDismiss: () => void
}

/**
 * "New section available" popover for incremental milestones (§4.5) — the same
 * detached card as the intro's NavReportsHint, anchored to the right of a nav
 * item, but non-blocking: no backdrop, no shield, just a one-time announcement
 * dismissed via "Got it" (or upstream, by visiting the section it announces).
 * Motion-driven entrance/exit instead of the CSS keyframe so it can also exit
 * gracefully and veil under an open flyout.
 */
export function NavSectionHint({ targetId, active, veiled = false, title, body, onDismiss }: NavSectionHintProps) {
  const reduced = !!useReducedMotion()
  const el = useCoachTarget(targetId)

  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Track the anchor through sidebar expand/collapse: the nav button resizes
  // with the bar, so a ResizeObserver on it fires through the width transition;
  // window resize covers viewport changes.
  useLayoutEffect(() => {
    if (!active || !el) {
      setPos(null)
      return
    }
    const measure = () => {
      const r = el.getBoundingClientRect()
      const top = r.top + r.height / 2
      const left = r.right + GAP
      setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener("resize", measure)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [active, el])

  // Measure-after-paint so the card centers on the anchor without a CSS
  // translateY (which would fight the motion transform). Dep-free like the
  // Coachmark's measure; the >1px guard quenches it.
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardH, setCardH] = useState(110)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight
    if (h && Math.abs(h - cardH) > 1) setCardH(h)
  })

  return createPortal(
    <AnimatePresence>
      {active && pos && (
        <motion.div
          ref={cardRef}
          className="nav-hint nav-hint--motion"
          role="dialog"
          aria-label={title}
          style={{
            top: Math.max(8, pos.top - cardH / 2),
            left: pos.left,
            pointerEvents: veiled ? "none" : "auto",
          }}
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: -6, scale: 0.97 }}
          animate={
            reduced
              ? { opacity: veiled ? 0 : 1 }
              : { opacity: veiled ? 0 : 1, x: 0, scale: 1 }
          }
          exit={
            reduced
              ? { opacity: 0, transition: { duration: 0.15 } }
              : { opacity: 0, x: -4, scale: 0.98, transition: { duration: 0.18, ease: EASE } }
          }
          transition={
            reduced
              ? { duration: 0.15 }
              : { type: "spring", bounce: 0.25, visualDuration: 0.35 }
          }
        >
          <span className="nav-hint-arrow" aria-hidden="true" />
          <div className="coach-card-title">{title}</div>
          <p className="gear-hint-body">{body}</p>
          <button type="button" className="gear-hint-dismiss" onClick={onDismiss}>
            Got it
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
