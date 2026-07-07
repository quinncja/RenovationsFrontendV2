import { useEffect, useRef, useState } from "react"
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
 * Right-edge section navigator. At rest it's an iOS-style column of dots; on
 * hover/focus the same element animates — via Motion `layout` — into a labeled
 * card: it grows in size, the dots travel from the column into their rows, and
 * the surface (background + ring + elevation shadow) fades up off the page so it
 * lifts with the dots. One always-mounted card (no duplicate layoutId ghosting).
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
      <motion.div
        layout
        className={`section-nav-card${expanded ? " section-nav-card-open" : ""}`}
        role="tablist"
        aria-label="Sections"
        initial={false}
        // The surface "appears from the background and lifts off the page": its
        // fill and elevation shadow fade up as it grows. Set via animate (not
        // CSS) so Motion scale-corrects them mid-layout. Two shadow layers in
        // both states (matching layer counts so Motion interpolates cleanly): a
        // hairline ring + a soft elevation shadow.
        animate={{
          backgroundColor: expanded ? "var(--card-color)" : "rgba(0, 0, 0, 0)",
          // At REST the ring is already present but faint — a subtle hairline
          // pill around the dot column that reads as "interactable" without a
          // fill or elevation. On open it strengthens to the full ring and the
          // soft elevation shadow (--button-shadow: a tight 0 1px 4px drop) fades
          // up. Constant offset/blur so only the alpha deepens.
          boxShadow: expanded
            ? "0 0 0 1px rgba(128, 128, 128, 0.18), 0 1px 4px rgba(0, 0, 0, 0.16)"
            : "0 0 0 1px rgba(128, 128, 128, 0.14), 0 1px 4px rgba(0, 0, 0, 0)",
        }}
        style={{ borderRadius: 12 }}
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
