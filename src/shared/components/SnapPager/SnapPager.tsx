import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import useIsMobile from "../../hooks/useIsMobile"
import { SectionDots } from "../../../modules/dashboard/components/SectionNav"

export interface SnapPagerSection {
  id: string
  title: string
  content: ReactNode
}

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

/**
 * Presentational sibling of the admin home's SectionPager: the same full-screen
 * scroll-snap column (snap, scroll-linked fades, arrow-key paging, zoom-to-fit,
 * load-time scroll anchoring) for a FIXED set of sections passed
 * as props — no layout-edit machinery, no widget registries. Reuses the
 * `.section-pager*` CSS classes, so the `.page:has(.section-pager)` header
 * overlay rules apply unchanged. Always starts at the first section (no
 * persisted restore); a navbar Home navigation (`state.resetHome`) scrolls back
 * to the top. With only 2-3 fixed sections the right rail is the static
 * SectionDots capsule (no hover-morph menu). On mobile it degrades to the same
 * plain `.section-stack` flow.
 */
export function SnapPager({ sections }: { sections: SnapPagerSection[] }) {
  const location = useLocation()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const scrollRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const panelRefs = useRef<(HTMLElement | null)[]>([])

  const [active, setActive] = useState(0)

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
    // scroll the final step.
    const neighbor = clamped > current ? clamped - 1 : clamped + 1
    panelRefs.current[neighbor]?.scrollIntoView({ behavior: "instant", block: "start" })
    requestAnimationFrame(() => {
      panelRefs.current[clamped]?.scrollIntoView({ behavior: scrollBehavior(), block: "start" })
    })
  }

  // ── Scroll anchoring across widget loads ──────────────────────────────
  // Skeletons are swapped for real widgets of different heights, shifting every
  // section below them. Anchor manually to the active panel: its offset within
  // the scroll content is scroll-invariant, so any change means content above
  // it grew or shrank — counter that exactly, pre-paint.
  const activeIndexRef = useRef(0)
  const anchorBaseline = useRef<number | null>(null)

  const measureAnchor = useCallback(() => {
    const root = scrollRef.current
    const el = panelRefs.current[activeIndexRef.current]
    if (!root || !el) return null
    // Offset of the panel within the scrollable content (scroll-position-free).
    return el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop
  }, [])

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
    setActive(best)
  }, [measureAnchor])

  // Set the initial fades before paint so there's no flash of all-dim.
  const didInit = useRef(false)
  useLayoutEffect(() => {
    if (isMobile) return
    if (didInit.current) return
    didInit.current = true
    applyFades()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Scroll back to the top when navigated here via the navbar Home button or
  // logo (which set `state.resetHome`).
  useEffect(() => {
    const resetHome = (location.state as { resetHome?: boolean } | null)?.resetHome
    if (!resetHome) return
    if (isMobile) {
      // Plain stacked flow — the page itself is the scroll container.
      stackRef.current?.closest(".page")?.scrollTo({ top: 0, behavior: scrollBehavior() })
    } else {
      scrollRef.current?.scrollTo({ top: 0, behavior: scrollBehavior() })
    }
    // Consume the flag so returning to this history entry later won't force the top.
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  // ── Fit-to-viewport ───────────────────────────────────────────────────
  // A section must always fit the screen whole. When its natural height
  // exceeds the viewport (smaller laptops), zoom the content down just enough
  // to fit — CSS `zoom` reflows real layout, so panel heights, snap points and
  // the scroll anchoring stay coherent. See SectionPager for the full story on
  // the growth ceiling and the anti-bounce dead zone.
  const fitRefs = useRef<(HTMLDivElement | null)[]>([])

  const fitSection = useCallback((i: number) => {
    const root = scrollRef.current
    const inner = fitRefs.current[i]
    const slide = inner?.parentElement // .section-slide-content (owns the padding)
    if (!root || !inner || !slide) return
    const cs = getComputedStyle(slide)
    const available = root.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
    if (available <= 0) return

    const applyZoom = (z: number) => {
      inner.style.zoom = z >= 1 ? "" : String(z)
      inner.style.setProperty("--fit-text-zoom", z >= 1 ? "1" : String(1 / Math.sqrt(z)))
    }

    if (inner.dataset.fitAvail !== String(available)) {
      inner.dataset.fitAvail = String(available)
      delete inner.dataset.fitCeil
    }
    const ceiling = inner.dataset.fitCeil ? parseFloat(inner.dataset.fitCeil) : 1

    const current = parseFloat(inner.dataset.fitZoom || "1")
    const first = inner.getBoundingClientRect().height
    if (!first) return
    const overflow = first - available
    if (overflow <= 2 && (overflow > -40 || current >= Math.min(1, ceiling))) return

    let zoom = current
    for (let pass = 0; pass < 4; pass++) {
      const visual = inner.getBoundingClientRect().height
      if (!visual) return
      const desired = Math.min(1, ceiling, (zoom * available) / visual)
      if (Math.abs(desired - zoom) < 0.01) break
      zoom = desired
      applyZoom(zoom)
    }
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

  // Watch every panel for size changes and counter any movement of the anchor
  // in the same frame, before paint.
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

  // Arrow keys page between sections with the same smooth scroll the dots use.
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
            <h2 className="section-pager-title title2 emphasized">{section.title}</h2>
            {section.content}
          </section>
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="section-pager" ref={scrollRef}>
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
                <h2 className="section-pager-title title2 emphasized">{section.title}</h2>
                {section.content}
              </div>
            </div>
          </section>
        ))}
      </div>

      <SectionDots
        sections={sections.map((s) => ({ id: s.id, title: s.title }))}
        active={active}
        onSelect={goTo}
      />
    </>
  )
}
