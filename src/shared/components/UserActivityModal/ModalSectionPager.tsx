import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

export interface PagerSection {
  id: string
  /** Accessible label for the section's dot. */
  label: string
  content: ReactNode
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
}

// Scroll-linked fade (fractions of the scroller height), mirroring the home
// SectionPager: the active section sits full-opacity at the top; the next peeks
// in below, dimmed to FADE_MIN, fading in as its top rises toward the top.
const ACTIVE_TOP_OFFSET = 56
const FADE_START_RATIO = 0.7
const FADE_END_RATIO = 0.14
const FADE_MIN = 0.3

/**
 * Vertical section pager for inside a modal — mirrors the home page: sections
 * are content-sized and snap to the TOP of the scroller, and a per-frame opacity
 * ramp leaves the active section full-opacity while the next peeks in below,
 * faded. A right-edge dot rail indicates / jumps between them.
 */
export function ModalSectionPager({ sections }: { sections: PagerSection[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const panelRefs = useRef<(HTMLElement | null)[]>([])
  const [active, setActive] = useState(0)

  // Mark the active section and fade each one by scroll position: a section is
  // full opacity once its top is within FADE_END of the scroller top, ramping
  // down to FADE_MIN once its top sits past FADE_START down the scroller.
  const applyFades = useCallback(() => {
    const root = scrollRef.current
    if (!root) return
    const rootTop = root.getBoundingClientRect().top
    const viewportH = root.clientHeight
    const fadeStart = viewportH * FADE_START_RATIO
    const fadeEnd = viewportH * FADE_END_RATIO
    let best = 0
    const panels = panelRefs.current
    for (let i = 0; i < panels.length; i++) {
      const el = panels[i]
      if (!el) continue
      const top = el.getBoundingClientRect().top - rootTop
      if (top <= ACTIVE_TOP_OFFSET) best = i
      const opacity =
        top <= fadeEnd
          ? 1
          : top >= fadeStart
            ? FADE_MIN
            : FADE_MIN + (1 - FADE_MIN) * ((fadeStart - top) / (fadeStart - fadeEnd))
      el.style.opacity = String(opacity)
    }
    setActive(best)
  }, [])

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return

    let raf = 0
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; applyFades() })
    }

    root.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    // Re-fade when a panel's height settles (e.g. engagement lists finish loading).
    const ro = new ResizeObserver(() => applyFades())
    for (const el of panelRefs.current) if (el) ro.observe(el)

    applyFades()
    return () => {
      root.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [sections.length, applyFades])

  const goTo = (i: number) =>
    panelRefs.current[i]?.scrollIntoView({ behavior: scrollBehavior(), block: "start" })

  return (
    <div className="usr-msec">
      <div className="usr-msec-scroll" ref={scrollRef}>
        {sections.map((s, i) => (
          <section
            key={s.id}
            data-index={i}
            ref={(el) => {
              panelRefs.current[i] = el
            }}
            className={`usr-msec-panel${i === active ? " usr-msec-panel--active" : ""}`}
          >
            {s.content}
          </section>
        ))}
      </div>
      <div className="usr-msec-dots" role="tablist" aria-label="Sections">
        {sections.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={s.label}
            className={`usr-msec-dot${i === active ? " usr-msec-dot--active" : ""}`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </div>
  )
}
