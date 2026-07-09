import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { SECTION_REGISTRY } from "../config/sectionRegistry"
import type { SectionLayout } from "../types/dashboardLayout"

// Opening: a little bounce for the playful grow/lift.
const SPRING_GROW = { type: "spring", visualDuration: 0.3, bounce: 0.2 } as const
// Closing & the section-change reflow: no bounce, so dots settle into place
// without overshooting past their spot and springing back.
const SPRING_SETTLE = { type: "spring", visualDuration: 0.28, bounce: 0 } as const

// The label's x slide (the little nudge in/out).
const LABEL_FADE_S = 0.14
// Opacity is keyframed so the text is gated to one end of each transition:
//   open  — holds invisible until 70% through, then fades in  ([0, 0, 1])
//   close — fades out by 30%, then stays gone while width collapses ([1, 0, 0])
// Durations track the grow/settle springs so the gating lands where intended.
const LABEL_OPEN_S = 0.3
const LABEL_CLOSE_S = 0.28

// After selecting a section, keep the card open this long before the animated
// exit — long enough for the page scroll to finish (so the close doesn't fight
// it) and to debounce repeated section changes.
const SELECT_CLOSE_MS = 850

/**
 * Right-edge section navigator. At rest it's a bordered capsule (year-selector
 * style) around a column of dots; on hover/focus it morphs into a labeled menu.
 * Three layers cooperate so the border stays pixel-crisp through the morph:
 *   1. Surface layer — the ONLY visible chrome (border + radius + fill + shadow).
 *      Morphs by animating real width/height to the card's measured rest/open box
 *      (NOT transform-scale, which distorts a crisp radius under this extreme
 *      aspect-ratio change). Constant CSS radius → no distortion, no end-snap.
 *   2. Card — Motion `layout`, but fully transparent: it only carries the dot/
 *      label layout and is the box the surface measures. Its messy transform
 *      morph (and label-collapse snap) is invisible because nothing paints on it.
 *   3. Dotrail — the visible dots, travelling on their own `layout`.
 * All three share one spring, so surface + dots morph in lockstep.
 * Copper marks only the active row — state, not decoration.
 */
export function SectionNav({
  sections,
  active,
  onSelect,
}: {
  sections: SectionLayout[]
  active: number
  onSelect: (index: number) => void
}) {
  // Two flags: `labels` (text presence, drives AnimatePresence) and `expanded`
  // (the card's size/surface). They flip together in both directions now — on
  // exit the label's width-collapse keeps the text from wrapping mid-shrink, so
  // there's no need to stage the text out ahead of the layout.
  const [expanded, setExpanded] = useState(false)
  const [labels, setLabels] = useState(false)
  // Tracks intent (open vs closing) to pick the spring: bouncy only while
  // opening. Flips to false the instant a close/select starts — before the
  // layout collapse — so the section-change reflow also settles without bounce.
  const [expanding, setExpanding] = useState(false)
  const closeTimer = useRef<number | undefined>(undefined)
  const selectTimer = useRef<number | undefined>(undefined)
  // While a select's close is pending, the post-scroll timer owns the close —
  // a plain mouseleave must not pre-empt it with the quick hover close.
  const selectPending = useRef(false)
  const navRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const transition = reduce ? { duration: 0.15 } : expanding ? SPRING_GROW : SPRING_SETTLE

  // The visible surface (fill + crisp border + shadow) is a SEPARATE layer that
  // morphs by animating its width/height DIRECTLY — not via the card's transform
  // `layout`, whose extreme non-uniform scale distorts a crisp border-radius and
  // snaps (that was the whole saga). We drive it to the card's measured rest/open
  // box sizes on the same spring, so it tracks the (now transparent) card while
  // staying pixel-crisp. Measured via offset* (layout size, ignores transform).
  const cardRef = useRef<HTMLDivElement>(null)
  const [restSize, setRestSize] = useState<{ w: number; h: number } | null>(null)
  const [openSize, setOpenSize] = useState<{ w: number; h: number } | null>(null)
  // The row count the cached openSize belongs to. The open box is measured just
  // ONCE per count (see below), so we remember which count that reading was for.
  const openSizeFor = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return
    if (expanded) {
      // Cache the open box ONCE per section count — and only from a CLEAN open.
      // Re-measuring on every open was the bug: a reopen that interrupts a still-
      // running close reuses the label elements, which still carry the exit's
      // partially-collapsed inline `width` (framer only restores it ~300ms later).
      // Measuring then cached a too-narrow (~85%) box, so the surface stalled short
      // and then lurched out to full once the width came back — a visible two-step.
      // (Hovering onto the dots reproduces it: the card's layout box jumps to full
      // size on open, the vertically-centered container recenters and briefly slips
      // out from under the pointer, and that mouseleave→reopen is the interrupt.)
      // The first open from full rest is always clean (labels freshly mounted at
      // their CSS width), so cache THAT and never let a later interrupted open
      // overwrite it. The open WIDTH is data-independent (fixed-width labels + the
      // card's min-width); only the HEIGHT scales with the count — so re-measure
      // solely when the count changes.
      if (openSizeFor.current !== sections.length) {
        openSizeFor.current = sections.length
        setOpenSize({ w: el.offsetWidth, h: el.offsetHeight })
      }
    } else if (!el.querySelector(".section-nav-label")) {
      // Rest: measure ONLY when the label DOM is truly gone. On close the
      // `labels` STATE flips false immediately but AnimatePresence keeps the
      // label elements mounted through their exit — measuring then would cache a
      // label-inflated "rest" width and the surface would animate to the wrong
      // (wide) size, lagging the dots. Checking the DOM (not the state) gives the
      // real resting box; measured on mount, it stays valid until sections change.
      setRestSize({ w: el.offsetWidth, h: el.offsetHeight })
    }
  }, [expanded, labels, sections.length])

  // Where the surface morphs TO. On close we target the cached resting box
  // immediately (not the label-inflated live card), so the border shrinks cleanly
  // instead of waiting on the label unmount.
  const surfaceSize = expanded ? openSize ?? restSize : restSize

  const clearTimers = () => {
    window.clearTimeout(closeTimer.current)
    window.clearTimeout(selectTimer.current)
  }

  // Collapse the labels and the card together: the label animates its width down
  // to 0 (see its `exit`) on the same settle spring the card layout uses, so the
  // text shrinks in flow with the surface instead of unmounting before it.
  const close = () => {
    clearTimers()
    selectPending.current = false
    setExpanding(false)
    setLabels(false)
    setExpanded(false)
  }

  // A short delay bridges the pointer crossing from the dots to the card.
  const openNav = () => {
    clearTimers()
    selectPending.current = false
    setExpanding(true)
    setExpanded(true)
    setLabels(true)
  }
  const scheduleClose = () => {
    // A pending select-close already owns the timing — don't shorten it.
    if (selectPending.current) return
    clearTimers()
    // Short bridge for the pointer crossing dots → card; kept brief so the card
    // clears out promptly once the pointer actually leaves.
    closeTimer.current = window.setTimeout(close, 60)
  }

  // Fires when the post-select debounce elapses. If the pointer is still over
  // the nav, the user is reading the card — keep it open and hand timing back to
  // the normal hover/leave logic (their next mouseleave closes it). Only close
  // here when the pointer has already left (e.g. moved away during the scroll).
  const selectClose = () => {
    selectPending.current = false
    if (navRef.current?.matches(":hover")) return
    close()
  }

  // Scroll now, but keep the card open; close it (full animated exit) only once
  // the scroll has settled — unless the pointer is still on the card then (see
  // selectClose). Re-selecting before then resets the timer (debounce).
  const select = (i: number) => {
    clearTimers()
    selectPending.current = true
    selectTimer.current = window.setTimeout(selectClose, SELECT_CLOSE_MS)
    onSelect(i)
  }

  // mouseleave doesn't fire when the window loses focus (alt-tab) or the tab is
  // hidden, so the card would stay open with no pointer on it. Close it, and drop
  // DOM focus from inside the card so focus-restore on return doesn't reopen it.
  useEffect(() => {
    const closeOnLeave = () => {
      close()
      const el = document.activeElement
      if (el instanceof HTMLElement && navRef.current?.contains(el)) el.blur()
    }
    const onVisibility = () => {
      if (document.hidden) closeOnLeave()
    }
    window.addEventListener("blur", closeOnLeave)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("blur", closeOnLeave)
      document.removeEventListener("visibilitychange", onVisibility)
    }
    // close()/timers are stable for our purposes; bind once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="section-nav"
      ref={navRef}
      onMouseEnter={openNav}
      onMouseLeave={scheduleClose}
      onFocusCapture={openNav}
      onBlurCapture={scheduleClose}
    >
      {/* Surface + border layer — the ONLY visible chrome. It morphs by animating
          real width/height (crisp radius, no scale distortion) to the card's
          measured rest/open box, on the same spring as the card, so it tracks the
          (transparent) card. Border + radius are constant CSS; fill + elevation
          fade in on open. Behind the card content (z:-1), non-interactive. */}
      {surfaceSize && (
        <div className="section-nav-surface" aria-hidden="true">
          <motion.div
            className="section-nav-surface-box"
            initial={false}
            animate={{
              width: surfaceSize.w,
              height: surfaceSize.h,
              // Rest 22 clamps to a full capsule (past half the ~43px box); open
              // 12 reads as a tighter rounded card. Safe to animate the radius
              // here — the box sizes via real width/height, never a transform
              // scale, so there's no distortion to trigger.
              borderRadius: expanded ? 12 : 22,
              // Fill fades white (open menu) → app background (rest), so the
              // resting pill reads as a filled capsule sitting on the page rather
              // than a see-through outline.
              backgroundColor: expanded ? "var(--card-color)" : "var(--background-color)",
              boxShadow: expanded
                ? "0 1px 4px rgba(0, 0, 0, 0.16)"
                : "0 1px 4px rgba(0, 0, 0, 0)",
            }}
            transition={transition}
          />
        </div>
      )}
      <motion.div
        layout
        ref={cardRef}
        className={`section-nav-card${expanded ? " section-nav-card-open" : ""}`}
        role="tablist"
        aria-label="Sections"
        initial={false}
        // Fully transparent now: the card only owns LAYOUT (dot/label positions +
        // the box the surface layer measures). Its transform `layout` morph — and
        // the label-collapse snap that used to plague a border drawn here — are
        // invisible because nothing on the card paints. The visible morph is the
        // surface layer (above) + the dots on the dotrail (below).
        transition={transition}
      >
        {sections.map((section, i) => (
          <motion.button
            layout
            key={section.id}
            type="button"
            className={`section-nav-row${i === active ? " section-nav-row-active" : ""}`}
            role="tab"
            aria-selected={i === active}
            aria-label={SECTION_REGISTRY[section.id].title}
            onClick={() => select(i)}
            transition={transition}
          >
            <AnimatePresence initial={false}>
              {labels && (
                <motion.span
                  key="label"
                  className="section-nav-label"
                  // Opacity is keyframed (held to the tail on open, the head on
                  // close); x slides on its own duration; width collapses on the
                  // settle spring in lockstep with the card. overflow:hidden (CSS)
                  // clips the text cleanly as the width animates closed.
                  initial={{ opacity: 0, x: 0 }}
                  animate={{ opacity: [0, 0, 1], x: 0 }}
                  exit={{
                    opacity: [1, 0, 0],
                    width: 0,
                    transition: {
                      width: SPRING_SETTLE,
                      opacity: { duration: LABEL_CLOSE_S, times: [0, 0.3, 1] },
                    },
                  }}
                  transition={{
                    x: { duration: LABEL_FADE_S },
                    // Hold invisible until 85%, then fade in over the last 15% —
                    // the text appears once the card has all but finished growing.
                    opacity: { duration: LABEL_OPEN_S, times: [0, 0.85, 1] },
                  }}
                >
                  {/* Inner text carries layout="position" purely for scale
                      correction: as the outer label's width collapses on exit,
                      the button's `layout` momentarily scaleX-squishes its
                      children — layout="position" makes Motion apply the inverse
                      scale to the glyphs, so the text stays undistorted and
                      simply gets clipped by the outer overflow:hidden. */}
                  <motion.span
                    layout="position"
                    className="section-nav-label-text"
                    transition={transition}
                  >
                    {SECTION_REGISTRY[section.id].title}
                  </motion.span>
                </motion.span>
              )}
            </AnimatePresence>
            {/* The visible dot now lives in the rail below (so it can't be pulled
                by the card's horizontal scale). This invisible spacer just
                reserves the dot's 8px slot, keeping each row's width/spacing
                identical to before. */}
            <span className="section-nav-dot section-nav-dot--spacer" aria-hidden="true" />
          </motion.button>
        ))}
      </motion.div>
      {/* Dot rail — a SIBLING of the card, so the card's horizontal grow/shrink
          never reaches it. It mirrors the card's vertical metrics and spring
          (same row heights, gaps, padding, right-anchoring) so its dots sit
          exactly on the rows, but its width is the dot column — CONSTANT across
          open/close (min-width override in CSS). With no width change there's no
          horizontal scale, so the dots only ever travel on Y: x-locked. Purely
          visual (pointer-events:none) — the card's rows still own hover/clicks. */}
      <div className="section-nav-dotrail" aria-hidden="true">
        <motion.div layout className={`section-nav-card${expanded ? " section-nav-card-open" : ""}`} transition={transition}>
          {sections.map((section, i) => (
            <motion.div
              layout
              key={section.id}
              className={`section-nav-row${i === active ? " section-nav-row-active" : ""}`}
              transition={transition}
            >
              <motion.span layout="position" className="section-nav-dot" transition={transition} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
