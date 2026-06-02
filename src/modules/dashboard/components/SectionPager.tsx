import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react"
import { useDashboardLayout } from "../context/DashboardLayoutContext"
import { SECTION_REGISTRY } from "../config/sectionRegistry"
import { WIDGET_REGISTRY } from "../config/widgetRegistry"
import type { WidgetLayoutItem } from "../types/dashboardLayout"

// A section is "active" once its top reaches this far below the viewport top.
// Fixed (not a viewport fraction) so a short top section still registers.
const ACTIVE_TOP_OFFSET = 80

// Scroll-linked fade tuning (fractions of the viewport height). A section is
// dimmed to FADE_MIN while its top sits below FADE_START_RATIO, fades in as it
// rises, and is fully opaque by FADE_END_RATIO — above the sticky line, so it's
// already faded in before it settles into place.
const FADE_START_RATIO = 0.7
const FADE_END_RATIO = 0.14
const FADE_MIN = 0.3

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
}

/** Build the grid children for a section — mirrors the home flat-map: an
 *  invisible spacer fills the left column when a half-width widget is offset. */
function renderSectionWidgets(widgets: WidgetLayoutItem[]): ReactNode[] {
  return widgets.flatMap((item) => {
    const elements: ReactNode[] = []
    if (item.offset && item.offset > 0 && item.colSpan === 1) {
      elements.push(<div key={`spacer-${item.id}`} className="widget-grid-spacer" />)
    }
    const Component = WIDGET_REGISTRY[item.id].component
    elements.push(
      <div
        key={item.id}
        className={`widget-slot widget-slot-${item.id}${item.colSpan === 2 ? " col-span-full" : ""}`}
      >
        <Component colSpan={item.colSpan} />
      </div>
    )
    return elements
  })
}

/**
 * Home page: content-sized sections stacked in a native scroll-snap column.
 * `scroll-snap-type: y mandatory` snaps every section's top to the same spot
 * (immune to the charts changing heights after load), with iOS-style momentum.
 * The active section is full opacity; the next peeks in below, faded. A section
 * taller than the screen scrolls internally, then chains to the next. Dots on
 * the right indicate / jump to sections; the native scrollbar sits at the edge.
 */
export function SectionPager({ enterAnimation = false }: { enterAnimation?: boolean }) {
  const { layout, activeSectionIndex, setActiveSectionIndex } = useDashboardLayout()
  const sections = layout.sections

  const scrollRef = useRef<HTMLDivElement>(null)
  const panelRefs = useRef<(HTMLElement | null)[]>([])

  const lastIndex = sections.length - 1
  const active = Math.max(0, Math.min(activeSectionIndex, lastIndex))

  const setActiveRef = useRef(setActiveSectionIndex)
  useEffect(() => {
    setActiveRef.current = setActiveSectionIndex
  }, [setActiveSectionIndex])

  function goTo(i: number) {
    const clamped = Math.max(0, Math.min(i, panelRefs.current.length - 1))
    panelRefs.current[clamped]?.scrollIntoView({ behavior: scrollBehavior(), block: "start" })
  }

  // Mark the active section + fade each one in by scroll position. A section is
  // full opacity once its top is within FADE_END of the top (above the sticky
  // line, so it's already faded in before it settles), ramping down to FADE_MIN
  // once its top sits past FADE_START down the viewport.
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
    setActiveRef.current(best)
  }, [])

  // On first mount, jump to the persisted section (instant, before paint), then
  // set the initial fades so there's no flash of all-dim before scrolling.
  const didInit = useRef(false)
  useLayoutEffect(() => {
    if (didInit.current) return
    didInit.current = true
    if (active > 0) panelRefs.current[active]?.scrollIntoView({ block: "start" })
    applyFades()
    // Only run once on mount; `active` is the persisted starting point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return

    let raf = 0
    function onScroll() {
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0
          applyFades()
        })
      }
    }

    root.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    applyFades()
    return () => {
      root.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [sections.length, applyFades])

  return (
    <>
      <div
        className={`section-pager${enterAnimation ? " section-pager-enter" : ""}`}
        ref={scrollRef}
      >
        {sections.map((section, i) => (
          <section
            key={section.id}
            data-index={i}
            ref={(el) => {
              panelRefs.current[i] = el
            }}
            className="section-pager-panel"
          >
            <div className="section-slide-content">
              <h2 className="section-pager-title title2 emphasized">
                {SECTION_REGISTRY[section.id].title}
              </h2>

              {section.widgets.length === 0 ? (
                <p className="section-pager-empty">This section has no widgets.</p>
              ) : (
                <div
                  className={`widget-grid widget-grid-${SECTION_REGISTRY[section.id].columns ?? 2} dashboard-home-grid`}
                >
                  {renderSectionWidgets(section.widgets)}
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="section-pager-dots" role="tablist" aria-label="Sections">
        {sections.map((section, i) => (
          <button
            key={section.id}
            type="button"
            className={`section-pager-dot${i === active ? " section-pager-dot-active" : ""}`}
            aria-label={SECTION_REGISTRY[section.id].title}
            aria-selected={i === active}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </>
  )
}
