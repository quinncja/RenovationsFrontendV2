import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

/** How far above the viewport edge the sticky card head pins (rem): most of
 *  the head's 1.25rem top padding (.pj-summary-head), leaving 0.5rem above
 *  the title row to match its 0.5rem bottom padding. The glass
 *  pane (.pj-summary-head::before) starts at the lift line, not the head's
 *  top, so no backdrop-filtered box straddles the scrollport edge (Safari
 *  blurs those unevenly). */
const HEAD_LIFT_REM = 0.75

interface Edges {
  left: boolean
  right: boolean
  up: boolean
  down: boolean
}

/**
 * Full-screen mode shared by the projection cards: the card lifts to a fixed
 * overlay (`pj-grid-expanded` + `pj-expand-backdrop`), the page behind is
 * scroll-locked, and Escape drops back — unless `modalOpen` (a confirm dialog
 * owns Escape while it's up).
 */
export function useCardFullscreen(modalOpen: boolean) {
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    if (!expanded) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false)
    }
    if (!modalOpen) window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener("keydown", onKey)
    }
  }, [expanded, modalOpen])
  return { expanded, setExpanded }
}

/**
 * Scroll-container machinery shared by the projection grid and the monthly
 * summary: which directions still hide content (frame classes drive the
 * pj-veil-* shadow overlays), the measured sticky geometry the overlays
 * position off, and the custom overlay scrollbar thumbs (native bars are
 * hidden — depending on system settings they either overlay unpredictably or
 * carve opaque gutters into the card).
 *
 * Conventions the scroll content is measured by: a sticky lead column marked
 * `.pj-sticky` in the thead, an optional sticky trailing column marked
 * `.pj-sticky-right`, and optional sticky thead/tfoot. Wrap the scroller in a
 * div carrying `frameClass` + `frameRef`, and render `affordances` as its
 * last child. Pass a `contentKey` that changes when the content grows so the
 * geometry re-measures (a ResizeObserver covers everything else), and a
 * `headerKey` that changes whenever the label row's rendering changes (sort
 * arrows) so the pinned clone is rebuilt from the live row.
 */
export function useOverlayScroll(contentKey?: unknown, headerKey?: unknown) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const vThumbRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLElement | null>(null)
  const scrollingTimer = useRef<number | undefined>(undefined)
  const [edges, setEdges] = useState<Edges>({ left: false, right: false, up: false, down: false })
  const [pinned, setPinned] = useState(false)
  const [headPinned, setHeadPinned] = useState(false)
  // Viewport-top → clone engagement distance: the pinned head's visible
  // height minus the zone-eyebrow row (the sentinel sits at the frame's top,
  // one eyebrow row above the label row). Re-measured with the geometry.
  const [pinOffset, setPinOffset] = useState(0)
  const [headLift, setHeadLift] = useState(0)

  const updateEdges = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const next = {
      left: el.scrollLeft > 1,
      right: el.scrollLeft < el.scrollWidth - el.clientWidth - 1,
      up: el.scrollTop > 1,
      down: el.scrollTop < el.scrollHeight - el.clientHeight - 1,
    }
    setEdges((prev) =>
      prev.left === next.left && prev.right === next.right && prev.up === next.up && prev.down === next.down
        ? prev
        : next
    )
  }, [])

  // Thumbs are laid out directly from scroll metrics — no React state, so a
  // scroll tick costs two style writes.
  const layoutThumbs = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const place = (thumb: HTMLDivElement | null, axis: "x" | "y") => {
      if (!thumb) return
      const track = thumb.parentElement as HTMLElement
      const trackSize = axis === "y" ? track.clientHeight : track.clientWidth
      const client = axis === "y" ? el.clientHeight : el.clientWidth
      const scrollSize = axis === "y" ? el.scrollHeight : el.scrollWidth
      const pos = axis === "y" ? el.scrollTop : el.scrollLeft
      const size = Math.max(trackSize * (client / scrollSize), 24)
      const max = scrollSize - client
      const offset = max > 0 ? (trackSize - size) * (pos / max) : 0
      if (axis === "y") {
        thumb.style.height = `${size}px`
        thumb.style.transform = `translateY(${offset}px)`
      } else {
        thumb.style.width = `${size}px`
        thumb.style.transform = `translateX(${offset}px)`
      }
    }
    place(vThumbRef.current, "y")
  }, [])

  const onScroll = useCallback(() => {
    updateEdges()
    layoutThumbs()
    // Keep the pinned strip's clone column-aligned during horizontal scroll
    // (this handler never fires on the page's vertical scroll — in normal
    // view the scroller only moves horizontally).
    const el = scrollRef.current
    if (el && trackRef.current) trackRef.current.style.transform = `translateX(${-el.scrollLeft}px)`
    const frame = frameRef.current
    if (frame) {
      frame.classList.add("pj-scrolling")
      window.clearTimeout(scrollingTimer.current)
      scrollingTimer.current = window.setTimeout(() => frame.classList.remove("pj-scrolling"), 800)
    }
  }, [updateEdges, layoutThumbs])

  useEffect(() => () => window.clearTimeout(scrollingTimer.current), [])

  // Size the thumbs when a track first mounts (they render only once their
  // axis is actually scrollable).
  useEffect(() => {
    layoutThumbs()
  }, [edges, layoutThumbs])

  // Dragging a thumb maps pointer travel back to scroll offset.
  const startThumbDrag = (axis: "x" | "y") => (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current
    if (!el || e.button !== 0) return
    e.preventDefault()
    const thumb = e.currentTarget
    const track = thumb.parentElement as HTMLElement
    const startPos = axis === "y" ? e.clientY : e.clientX
    const startScroll = axis === "y" ? el.scrollTop : el.scrollLeft
    const trackSize = axis === "y" ? track.clientHeight : track.clientWidth
    const thumbSize = axis === "y" ? thumb.offsetHeight : thumb.offsetWidth
    const maxScroll = axis === "y" ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth
    const scale = maxScroll / Math.max(trackSize - thumbSize, 1)
    const move = (ev: PointerEvent) => {
      const delta = ((axis === "y" ? ev.clientY : ev.clientX) - startPos) * scale
      if (axis === "y") el.scrollTop = startScroll + delta
      else el.scrollLeft = startScroll + delta
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      frameRef.current?.classList.remove("pj-sb-dragging")
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    frameRef.current?.classList.add("pj-sb-dragging")
  }

  // Measure the sticky geometry (thead/tfoot heights, lead/trailing sticky
  // column widths) into CSS vars on the frame. The veils, thumb tracks, and
  // the grid's second sticky header row position themselves off these, so
  // nothing in the CSS hardcodes a row height and the overlays stay flush at
  // any zoom/font size.
  useEffect(() => {
    const el = scrollRef.current
    const frame = frameRef.current
    if (!el || !frame) return
    const measure = () => {
      const px = (n: number) => `${n}px`
      const s = frame.style
      const q = (sel: string) => el.querySelector<HTMLElement>(sel)
      const theadH = q("thead")?.offsetHeight ?? 0
      const tfootH = q("tfoot")?.offsetHeight ?? 0
      const r1H = q("thead tr:first-child")?.offsetHeight ?? 0
      // From the label row (last thead row), never the zone-eyebrow row:
      // full screen hides that row, so its cells measure 0.
      s.setProperty("--pj-lft", px(q("thead tr:last-child .pj-sticky")?.offsetWidth ?? 0))
      // Horizontal travel, for the strip's scroll-driven slide (pj-track-slide
      // keyframes): the clone moves 0..-xmax as the sheet scrolls 0..xmax,
      // on the compositor, in step with the table.
      s.setProperty("--pj-xmax", px(Math.max(0, el.scrollWidth - el.clientWidth)))
      s.setProperty("--pj-rgt", px(q("thead .pj-sticky-right")?.offsetWidth ?? 0))
      s.setProperty("--pj-r1", px(r1H))
      s.setProperty("--pj-top", px(theadH))
      s.setProperty("--pj-btm", px(tfootH))
      // The pin scope (card head + frame) ends at the totals bar too, so the
      // sticky head departs with the last data row exactly like the clone.
      const scope = frame.parentElement
      const head = scope?.querySelector<HTMLElement>(".pj-summary-head")
      scope?.style.setProperty("--pj-btm", px(tfootH))
      // The strip's height (the label row): the scope ends this much above
      // the totals bar so the head and the strip depart together at the
      // card's exit instead of the head sliding under the strip.
      scope?.style.setProperty("--pj-strip", px(Math.max(0, theadH - r1H)))
      // Sticky head geometry: it pins HEAD_LIFT above the viewport edge so
      // its airy top padding tucks away and the band reads compact; the clone
      // strip and the engagement sentinel both offset by the visible remainder.
      const lift = HEAD_LIFT_REM * parseFloat(getComputedStyle(document.documentElement).fontSize)
      const headH = head?.offsetHeight ?? 0
      s.setProperty("--pj-head-lift", px(lift))
      s.setProperty("--pj-head", px(headH))
      scope?.style.setProperty("--pj-head-lift", px(lift))
      setHeadLift(lift)
      // Where the label row sits inside the frame (0 for the pipeline's
      // single-row thead, the eyebrow row's height for the grid): the clone
      // strip's containing pane starts there so the clone rests exactly over
      // the live row, and the engagement sentinel offsets by the same amount.
      const lblRow = q("thead tr:nth-child(2)") ?? q("thead tr")
      // Relative to the frame's padding edge (the pane is absolute inside
      // it), so a frame border can never offset the clone from the live row.
      const lblTop = lblRow ? lblRow.getBoundingClientRect().top - frame.getBoundingClientRect().top - frame.clientTop : 0
      s.setProperty("--pj-lbl", px(lblTop))
      setPinOffset(Math.max(0, headH - lift - lblTop))
      // Full screen: the strip overlays the scroller's top, so the scroller
      // pads by the tools band's height and frame-relative overlays (veils,
      // vertical thumb) start below it. 0 in normal view, where the strip
      // rides the page scroll and takes no layout space of its own.
      const tools = frame.querySelector<HTMLElement>(".pj-pin-tools")
      const toolsH = tools && frame.closest(".pj-grid-expanded") ? tools.offsetHeight : 0
      s.setProperty("--pj-tools", px(toolsH))
      // Full screen also pins the add-project line above the totals bar, so
      // the bottom overlays (down veil, vertical thumb) stop above it.
      const addH = frame.closest(".pj-grid-expanded") ? q("tr.pj-add-tr")?.offsetHeight ?? 0 : 0
      s.setProperty("--pj-add", px(addH))
      // Rebuild the pinned strip's clone of the column-label row (see the
      // pj-pin-strip CSS): same cells with explicit widths copied from the
      // live row, so the clone stays column-aligned at any zoom, font, or
      // data width. Pipeline's thead has a single row, which IS its label
      // row; the grid's labels are the second row under the zone eyebrows.
      const track = frame.querySelector<HTMLElement>(".pj-pin-track")
      const labelRow =
        el.querySelector<HTMLTableRowElement>("thead tr:nth-child(2)") ??
        el.querySelector<HTMLTableRowElement>("thead tr")
      trackRef.current = track
      if (track && labelRow) {
        const clone = labelRow.cloneNode(true) as HTMLTableRowElement
        Array.from(clone.cells).forEach((cell, i) => {
          cell.style.width = px(labelRow.cells[i]?.offsetWidth ?? 0)
          cell.style.boxSizing = "border-box"
        })
        const table = document.createElement("table")
        table.className = "pj-table"
        const cloneHead = document.createElement("thead")
        cloneHead.appendChild(clone)
        table.appendChild(cloneHead)
        track.replaceChildren(table)
        track.style.transform = `translateX(${-el.scrollLeft}px)`
        // The strip's sticky Address slot shows the live lead cell's own
        // content (its sort button and arrow), so it reads and sorts like
        // every other column label; pinAddrClick forwards its clicks.
        const addr = frame.querySelector<HTMLElement>(".pj-pin-addr")
        const lead = labelRow.cells[0]
        if (addr && lead) addr.innerHTML = lead.innerHTML
      }
      updateEdges()
      layoutThumbs()
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    // The card head's height positions the pinned rule and label strip
    // (--pj-head), so any late change to it (fonts, the format bar
    // mounting) must re-measure or the strip docks below the head.
    const headEl = frame.parentElement?.querySelector<HTMLElement>(".pj-summary-head")
    if (headEl) ro.observe(headEl)
    // Row swaps that keep the table the same height (the add-project line
    // giving way to a same-height draft row, and back) never fire the
    // ResizeObserver, yet --pj-add must drop to 0 the moment the pinned line
    // is gone or the down veil keeps shading the row above the totals bar.
    const body = el.querySelector("tbody")
    const mo = new MutationObserver(measure)
    if (body) mo.observe(body, { childList: true })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [updateEdges, layoutThumbs, contentKey, headerKey])

  // Pinned-state detection for the compact strip: a zero-size sentinel at
  // the frame's top; when it crosses above the page's viewport, the sticky
  // strip is standing over scrolled content, so the frame gets .pj-pinned
  // and the strip transitions in. The observer fires only at the crossing —
  // no per-scroll-tick work. WHERE the strip stops is CSS's job, not ours:
  // it is sticky inside .pj-pin-bound, whose bottom edge sits at the totals
  // bar, so the browser slides it away with the last data row. Pinned-ness
  // is React state folded into frameClass, NOT an imperative classList
  // toggle: React owns the frame's className and rewrites it whenever the
  // edge state changes (e.g. on horizontal scroll), which would silently
  // strip an imperatively-added class.
  useEffect(() => {
    const frame = frameRef.current
    const page = frame?.closest<HTMLElement>(".page")
    if (!frame || !page || !frame.querySelector(".pj-pin-strip")) return
    const sentinel = document.createElement("div")
    sentinel.style.cssText = "position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none"
    frame.prepend(sentinel)
    const io = new IntersectionObserver(
      ([entry]) => {
        setPinned(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0))
      },
      // Fires when the LABEL ROW meets the pinned head's bottom edge, not
      // when the frame meets the viewport: that is where the clone strip
      // (sticky from the label row's own position) starts standing over
      // scrolled content.
      { root: page, rootMargin: `-${pinOffset}px 0px 0px 0px` }
    )
    io.observe(sentinel)
    return () => {
      io.disconnect()
      sentinel.remove()
    }
  }, [pinOffset])

  // Head pinning: the card head is natively sticky inside the pin scope and
  // pins the instant the card's top leaves the viewport. This sentinel only
  // toggles .pj-head-pinned on the scope, which fades the glass in under the
  // head and dresses its title and tools as pills (pure CSS transitions).
  useEffect(() => {
    const scope = frameRef.current?.parentElement
    const page = scope?.closest<HTMLElement>(".page")
    if (!scope || !page || !scope.classList.contains("pj-pin-scope")) return
    const sentinel = document.createElement("div")
    sentinel.style.cssText = "position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none"
    scope.prepend(sentinel)
    const io = new IntersectionObserver(
      ([entry]) => {
        setHeadPinned(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0))
      },
      // The head pins HEAD_LIFT above the viewport edge, so the crossing is
      // that far above the root's top.
      { root: page, rootMargin: `${headLift}px 0px 0px 0px` }
    )
    io.observe(sentinel)
    return () => {
      io.disconnect()
      sentinel.remove()
    }
  }, [headLift])

  // Subtitle fade: while the head is pinned the subtitle scrolls under it,
  // and its opacity tracks how much of it the head already covers, so it
  // dissolves into the glass instead of being cut by its edge. One rect read
  // and one style write per page-scroll tick, only while pinned.
  useEffect(() => {
    const scope = frameRef.current?.parentElement
    const page = scope?.closest<HTMLElement>(".page")
    const head = scope?.querySelector<HTMLElement>(".pj-summary-head")
    const sub = scope?.querySelector<HTMLElement>(".pj-summary-sub")
    if (!page || !head || !sub) return
    if (!headPinned) {
      sub.style.opacity = ""
      return
    }
    const tick = () => {
      const r = sub.getBoundingClientRect()
      const covered = head.getBoundingClientRect().bottom - r.top
      const t = r.height > 0 ? Math.min(1, Math.max(0, covered / r.height)) : 0
      sub.style.opacity = String(1 - t)
    }
    tick()
    page.addEventListener("scroll", tick, { passive: true })
    return () => page.removeEventListener("scroll", tick)
  }, [headPinned])

  const frameClass =
    "pj-grid-frame" +
    (edges.left ? " pj-can-left" : "") +
    (edges.right ? " pj-can-right" : "") +
    (edges.up ? " pj-can-up" : "") +
    (edges.down ? " pj-can-down" : "") +
    (pinned ? " pj-pinned" : "")

  const affordances = (
    <>
      <div className="pj-veil pj-veil-up" aria-hidden="true" />
      <div className="pj-veil pj-veil-down" aria-hidden="true" />
      <div className="pj-veil pj-veil-left" aria-hidden="true" />
      <div className="pj-veil pj-veil-right" aria-hidden="true" />
      {(edges.up || edges.down) && (
        <div className="pj-sb-track pj-sb-v" aria-hidden="true">
          <div className="pj-sb-thumb" ref={vThumbRef} onPointerDown={startThumbDrag("y")} />
        </div>
      )}
    </>
  )

  const scopeClass = "pj-pin-scope" + (headPinned ? " pj-head-pinned" : "")

  return { scrollRef, frameRef, frameClass, scopeClass, onScroll, affordances }
}
