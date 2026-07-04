import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import useIsMobile from "../../../shared/hooks/useIsMobile"
import { useDashboardLayout } from "../context/DashboardLayoutContext"
import { SECTION_REGISTRY } from "../config/sectionRegistry"
import { SectionNav } from "./SectionNav"
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
function renderSectionWidgets(widgets: WidgetLayoutItem[], sectionId: string): ReactNode[] {
  return widgets.flatMap((item) => {
    const elements: ReactNode[] = []
    if (item.offset && item.offset > 0 && item.colSpan === 1) {
      elements.push(<div key={`spacer-${item.id}`} className="widget-grid-spacer" />)
    }
    const Component = WIDGET_REGISTRY[item.id].component
    elements.push(
      <div
        key={item.id}
        data-widget-id={item.id}
        data-section-id={sectionId}
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
  const location = useLocation()
  const navigate = useNavigate()
  const sections = layout.sections

  // Mobile renders a plain stacked flow instead of the snap pager — the
  // `.page:has(.section-pager)` overlay rules stop matching, so the dashboard
  // becomes an ordinary scrolling page. All pager behaviors (snap, fades,
  // dots, zoom-fit, scroll restore/anchoring) are skipped.
  const isMobile = useIsMobile()

  const scrollRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const panelRefs = useRef<(HTMLElement | null)[]>([])

  const lastIndex = sections.length - 1
  const active = Math.max(0, Math.min(activeSectionIndex, lastIndex))

  const setActiveRef = useRef(setActiveSectionIndex)
  useEffect(() => {
    setActiveRef.current = setActiveSectionIndex
  }, [setActiveSectionIndex])

  function goTo(i: number) {
    const max = panelRefs.current.length - 1
    const clamped = Math.max(0, Math.min(i, max))
    const current = activeIndexRef.current
    // Adjacent (or same) — a single smooth scroll already reads as one step.
    if (Math.abs(clamped - current) <= 1) {
      panelRefs.current[clamped]?.scrollIntoView({ behavior: scrollBehavior(), block: "start" })
      return
    }
    // Far jump — instant-hop to the section just before the target, then smooth-
    // scroll the final step. The user sees one section's worth of motion instead
    // of flying through every section in between.
    const neighbor = clamped > current ? clamped - 1 : clamped + 1
    panelRefs.current[neighbor]?.scrollIntoView({ behavior: "instant", block: "start" })
    requestAnimationFrame(() => {
      panelRefs.current[clamped]?.scrollIntoView({ behavior: scrollBehavior(), block: "start" })
    })
  }

  // ── Scroll anchoring across widget loads ──────────────────────────────
  // Skeletons are swapped for real widgets of different heights, shifting
  // every section below them — on a restored (non-first) section that read as
  // a ~20px jump followed by the mandatory snap re-settling. Native browser
  // anchoring can't compensate because the node it anchors to is often the
  // skeleton being removed. So we anchor manually to the active panel: its
  // offset within the scroll content is scroll-invariant, so any change means
  // content above it grew or shrank — counter that exactly, pre-paint.
  const activeIndexRef = useRef(active)
  const anchorBaseline = useRef<number | null>(null)

  const measureAnchor = useCallback(() => {
    const root = scrollRef.current
    const el = panelRefs.current[activeIndexRef.current]
    if (!root || !el) return null
    // Offset of the panel within the scrollable content (scroll-position-free).
    return el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop
  }, [])

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
    if (best !== activeIndexRef.current) {
      // The anchor follows the active section — re-baseline on every switch.
      activeIndexRef.current = best
      anchorBaseline.current = measureAnchor()
    }
    setActiveRef.current(best)
  }, [measureAnchor])

  // On first mount, jump to the persisted section (instant, before paint), then
  // set the initial fades so there's no flash of all-dim before scrolling.
  const didInit = useRef(false)
  useLayoutEffect(() => {
    if (isMobile) return
    if (didInit.current) return
    didInit.current = true
    // A navbar Home/logo navigation arrives with `state.resetHome` → start at the
    // top; otherwise (back/forward, refresh) restore the persisted section.
    const resetHome = (location.state as { resetHome?: boolean } | null)?.resetHome
    if (!resetHome && active > 0) panelRefs.current[active]?.scrollIntoView({ block: "start" })
    applyFades()
    // Only run once on mount; `active` is the persisted starting point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reset to the top when navigated here via the navbar Home button or logo
  // (which set `state.resetHome`). Plain back/forward carry no such state, so they
  // keep the restored section. Runs on mount and on same-route re-clicks.
  useEffect(() => {
    const resetHome = (location.state as { resetHome?: boolean } | null)?.resetHome
    if (!resetHome) return
    if (isMobile) {
      // Plain stacked flow — the page itself is the scroll container.
      stackRef.current?.closest(".page")?.scrollTo({ top: 0, behavior: scrollBehavior() })
    } else {
      scrollRef.current?.scrollTo({ top: 0, behavior: scrollBehavior() })
      setActiveSectionIndex(0)
    }
    // Consume the flag so returning to this history entry later won't force the top.
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  // ── Fit-to-viewport ───────────────────────────────────────────────────
  // A section must always fit the screen whole — no internal scrolling. When
  // its natural height exceeds the viewport (smaller laptops), zoom the
  // content down just enough to fit. CSS `zoom` reflows real layout (unlike
  // transform), so panel heights, snap points and the scroll anchoring all
  // stay coherent for free. The slide padding sits outside the zoomed
  // wrapper, so the title's clearance from the header overlay never shrinks.
  const fitRefs = useRef<(HTMLDivElement | null)[]>([])

  const fitSection = useCallback((i: number) => {
    const root = scrollRef.current
    const inner = fitRefs.current[i]
    const slide = inner?.parentElement // .section-slide-content (owns the padding)
    if (!root || !inner || !slide) return
    const cs = getComputedStyle(slide)
    const available = root.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
    if (available <= 0) return

    // Apply the zoom plus a counter-zoom var for select text (section title,
    // widget titles, key labels, chart tooltips — see the .section-fit CSS):
    // counter-zooming by 1/√z lands that text at √z, so it shrinks roughly
    // half as much as the layout around it.
    const applyZoom = (z: number) => {
      inner.style.zoom = z >= 1 ? "" : String(z)
      inner.style.setProperty("--fit-text-zoom", z >= 1 ? "1" : String(1 / Math.sqrt(z)))
    }

    // Growth ceiling: the highest zoom known to overflow at this viewport
    // size. Counter-zoomed text can wrap at a higher zoom and unwrap at a
    // lower one (a ~20px discontinuity with no stable zoom in between), which
    // made some sections bounce forever. The ceiling ratchets each failed
    // growth attempt down until a stable zoom exists. Reset on viewport change.
    if (inner.dataset.fitAvail !== String(available)) {
      inner.dataset.fitAvail = String(available)
      delete inner.dataset.fitCeil
    }
    const ceiling = inner.dataset.fitCeil ? parseFloat(inner.dataset.fitCeil) : 1

    const current = parseFloat(inner.dataset.fitZoom || "1")
    const first = inner.getBoundingClientRect().height
    if (!first) return
    // Dead zone: our own zoom writes echo back through the ResizeObserver —
    // re-entries that land in this band make no writes, so the echo (and the
    // visible bouncing) stops. Up to 2px overflow is tolerated; growing back
    // requires more than a wrapped line's worth of slack so wrap/unwrap can't
    // ping-pong the fit.
    const overflow = first - available
    if (overflow <= 2 && (overflow > -40 || current >= Math.min(1, ceiling))) return

    let zoom = current
    // Shrinking reflows text/grids, which changes the natural height again —
    // a few passes settle it. Visual height = rect (already includes zoom).
    for (let pass = 0; pass < 4; pass++) {
      const visual = inner.getBoundingClientRect().height
      if (!visual) return
      const desired = Math.min(1, ceiling, (zoom * available) / visual)
      if (Math.abs(desired - zoom) < 0.01) break
      zoom = desired
      applyZoom(zoom)
    }
    // Exact final pass — never end visibly over the viewport. Reaching here
    // means a growth attempt overshot (likely text wrapping): remember it.
    const after = inner.getBoundingClientRect().height
    if (after > available + 1) {
      inner.dataset.fitCeil = String(Math.max(0.2, zoom - 0.005))
      zoom = (zoom * available) / after
      applyZoom(zoom)
    }
    inner.dataset.fitZoom = String(zoom)
  }, [])

  // Refit when a section's content settles (data load) or the window resizes.
  useEffect(() => {
    if (isMobile) return
    const fitAll = () => {
      for (let i = 0; i < sections.length; i++) fitSection(i)
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const idx = Number((entry.target as HTMLElement).dataset.fitIndex)
        if (Number.isInteger(idx)) fitSection(idx)
      }
    })
    for (const el of fitRefs.current) if (el) ro.observe(el)
    fitAll()
    window.addEventListener("resize", fitAll)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", fitAll)
    }
  }, [sections.length, fitSection, isMobile])

  // Watch every panel for size changes (widgets settling after data load) and
  // counter any movement of the anchor in the same frame, before paint — the
  // viewport never visibly shifts and the snap never has to re-settle.
  useEffect(() => {
    if (isMobile) return
    const root = scrollRef.current
    if (!root) return
    anchorBaseline.current = measureAnchor()
    const ro = new ResizeObserver(() => {
      const next = measureAnchor()
      const prev = anchorBaseline.current
      if (next != null && prev != null && next !== prev) {
        // behavior: "instant" — the container's CSS scroll-behavior is smooth,
        // which would turn this correction into a visible glide.
        root.scrollTo({ top: root.scrollTop + (next - prev), behavior: "instant" })
      }
      anchorBaseline.current = next
    })
    for (const el of panelRefs.current) if (el) ro.observe(el)
    return () => ro.disconnect()
  }, [sections.length, measureAnchor, isMobile])

  useEffect(() => {
    if (isMobile) return
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
  }, [sections.length, applyFades, isMobile])

  // Arrow keys page between sections with the SAME smooth scroll the dots use.
  // Native arrow scrolling line-steps the snap container (the jumpy default), so
  // we intercept Up/Down, preventDefault, and route through goTo (smooth glide
  // to the next/prev panel). Driven off the live active index (activeIndexRef),
  // so quick taps advance section-by-section as each one is crossed. Ignored
  // while typing in a field / with modifiers so it never eats text-cursor keys.
  useEffect(() => {
    if (isMobile) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const el = document.activeElement
      if (el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      e.preventDefault()
      goTo(activeIndexRef.current + (e.key === "ArrowDown" ? 1 : -1))
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
    // goTo + refs are stable for our purposes; bind once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile])

  if (isMobile) {
    return (
      <div className="section-stack" ref={stackRef}>
        {sections.map((section) => (
          <section key={section.id} className="section-stack-panel">
            <h2 className="section-pager-title title2 emphasized">
              {SECTION_REGISTRY[section.id].title}
            </h2>
            {section.widgets.length === 0 ? (
              <p className="section-pager-empty">This section has no widgets.</p>
            ) : (
              <div className="widget-grid section-stack-grid">
                {/* Every widget full width — no half columns, offsets or spacers. */}
                {section.widgets.map((item) => {
                  const Component = WIDGET_REGISTRY[item.id].component
                  return (
                    <div
                      key={item.id}
                      data-widget-id={item.id}
                      data-section-id={section.id}
                      className={`widget-slot widget-slot-${item.id}`}
                    >
                      <Component colSpan={item.colSpan} />
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    )
  }

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
              {/* Zoom-to-fit wrapper — scaled down only when the section would
                  overflow the viewport (see fitSection). */}
              <div
                className="section-fit"
                data-fit-index={i}
                ref={(el) => {
                  fitRefs.current[i] = el
                }}
              >
                <h2 className="section-pager-title title2 emphasized">
                  {SECTION_REGISTRY[section.id].title}
                </h2>

                {section.widgets.length === 0 ? (
                  <p className="section-pager-empty">This section has no widgets.</p>
                ) : (
                  <div
                    className={`widget-grid widget-grid-${SECTION_REGISTRY[section.id].columns ?? 2} dashboard-home-grid`}
                  >
                    {renderSectionWidgets(section.widgets, section.id)}
                  </div>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>

      <SectionNav sections={sections} active={active} onSelect={goTo} />
    </>
  )
}
