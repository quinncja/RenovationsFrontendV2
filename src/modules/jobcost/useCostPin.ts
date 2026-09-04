import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"

/** How far above the scrollport edge the card head pins (rem): most of its
 *  1.25rem top padding, leaving 0.5rem above the title row to match the
 *  0.5rem beneath it — the same lift the Projection Board's head uses. */
const HEAD_LIFT_REM = 0.75
/** Longest of the pinned-dress transitions (title transform / pill glass,
 *  220ms in App.css) plus a little slack. */
const DISARM_MS = 260

/**
 * Page-scroll pinning for the Spending Breakdown card, on the Projection
 * Board's recipe (useOverlayScroll): the card head (title + view pill) is
 * natively sticky and pins the moment the card's top scrolls away; beneath
 * it the open group's row (category or month) and that
 * group's line-item column labels stack up, each offset by the measured
 * height of the bands above it. Everything is native position: sticky —
 * this card has no horizontal scroller, so no clone strip is needed. An
 * IntersectionObserver sentinel toggles `.jcd-cost-head-pinned` on the card,
 * which fades the glass in and condenses the title into a pill (pure CSS
 * transitions). Only `active` (a group is open) arms it; with every group
 * closed the card is a few rows tall and nothing needs to pin.
 *
 * Attach `ref` to a wrapper around the Widget; the hook finds the card and
 * its bands by class.
 */
export function useCostPin(active: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const [lift, setLift] = useState(0)

  // Measurements → CSS vars on the card. Re-run whenever the table or head
  // resizes (rows opening, the header wrapping, the view switching).
  useEffect(() => {
    const card = ref.current?.querySelector<HTMLElement>(".jcd-cost-widget")
    if (!card) return
    if (!active) {
      // Disarm in two beats: drop the pinned dress first so the title and
      // view pill transition back to their resting styles (those transitions
      // live on .jcd-cost-pin), then release the arming class once they have
      // finished. Both in one tick would snap them.
      card.classList.remove("jcd-cost-head-pinned")
      const t = window.setTimeout(() => card.classList.remove("jcd-cost-pin"), DISARM_MS)
      return () => window.clearTimeout(t)
    }
    card.classList.add("jcd-cost-pin")
    const px = (n: number) => `${Math.round(n * 100) / 100}px`
    const measure = () => {
      const s = card.style
      const head = card.querySelector<HTMLElement>(".widget-header")
      const table = card.querySelector<HTMLElement>("table.jc-cost-breakdown")
      const groupRow = table?.querySelector<HTMLElement>(":scope > tbody > .spend-rank-table-row")
      const subHead = table?.querySelector<HTMLElement>(".jc-txn-table > thead")
      const liftPx = HEAD_LIFT_REM * parseFloat(getComputedStyle(document.documentElement).fontSize)
      s.setProperty("--jcd-lift", px(liftPx))
      s.setProperty("--jcd-head", px(head?.offsetHeight ?? 0))
      s.setProperty("--jcd-group", px(groupRow?.offsetHeight ?? 0))
      s.setProperty("--jcd-sub", px(subHead?.offsetHeight ?? 0))
      setLift(liftPx)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(card)
    const head = card.querySelector<HTMLElement>(".widget-header")
    if (head) ro.observe(head)
    // The arming class is released by the !active branch above (after the
    // dress has transitioned), not here.
    return () => ro.disconnect()
  }, [active])

  // Head-pinned dress: a sentinel at the card's top; once it has scrolled
  // past the lift line the head is standing over content.
  useEffect(() => {
    const card = ref.current?.querySelector<HTMLElement>(".jcd-cost-widget")
    const page = card?.closest<HTMLElement>(".page")
    if (!card || !page || !active) return
    const sentinel = document.createElement("div")
    sentinel.style.cssText = "position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none"
    card.prepend(sentinel)
    const io = new IntersectionObserver(
      ([entry]) => {
        const pinned = !entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0)
        card.classList.toggle("jcd-cost-head-pinned", pinned)
      },
      { root: page, rootMargin: `${lift}px 0px 0px 0px` }
    )
    io.observe(sentinel)
    return () => {
      io.disconnect()
      sentinel.remove()
      card.classList.remove("jcd-cost-head-pinned")
    }
  }, [active, lift])

  // Stuck-row tag: an open group's row docked under the head covers the
  // card's side line beside its rounded corners (see .jcd-stuck in App.css)
  // so no notch shows between the radius and the card edge.
  // One rect read per open row per page-scroll tick, only while armed.
  useEffect(() => {
    const card = ref.current?.querySelector<HTMLElement>(".jcd-cost-widget")
    const page = card?.closest<HTMLElement>(".page")
    if (!card || !page || !active) return
    const tick = () => {
      const head = card.querySelector<HTMLElement>(".widget-header")
      if (!head) return
      const headBottom = head.getBoundingClientRect().bottom
      const pinned = card.classList.contains("jcd-cost-head-pinned")
      card.querySelectorAll<HTMLElement>("table.jc-cost-breakdown > tbody > .jc-row-open").forEach((row) => {
        const tbody = row.parentElement as HTMLElement
        // The row is pushed out by the group's last line item: once that
        // item's top reaches the docked row's bottom, the row slides up ahead
        // of it (a negative --jcd-push on the sticky top), never covering it
        // — the last item is then the one thing left scrolling off under the
        // head. No items: the frame's bottom pushes instead.
        const lastItem = tbody.querySelector<HTMLElement>(".jc-txn-table > tbody > tr:last-child")
        const dockTop = (lastItem
          ? lastItem.getBoundingClientRect().top
          : tbody.getBoundingClientRect().bottom) - row.offsetHeight
        const push = pinned ? Math.min(0, dockTop - headBottom) : 0
        tbody.style.setProperty("--jcd-push", `${Math.round(push * 100) / 100}px`)
        const stuck = pinned && push === 0 && row.getBoundingClientRect().top <= headBottom + 0.5
        row.classList.toggle("jcd-stuck", stuck)
      })
    }
    tick()
    page.addEventListener("scroll", tick, { passive: true })
    const ro = new ResizeObserver(tick)
    ro.observe(card)
    return () => {
      page.removeEventListener("scroll", tick)
      ro.disconnect()
      card.querySelectorAll(".jcd-stuck").forEach((el) => el.classList.remove("jcd-stuck"))
      card.querySelectorAll<HTMLElement>("table.jc-cost-breakdown > tbody").forEach((tb) => tb.style.removeProperty("--jcd-push"))
    }
  }, [active])

  return ref
}

/**
 * Keeps the Spending Breakdown card in view across a Categories ⇄ Timeline
 * switch made while its head is pinned. The new table mounts a few rows
 * tall, so without this the page's scroll offset lands well past the card
 * and the whole widget vanishes upward. Call `beforeSwitch()` in the click
 * handler (the old DOM is still standing, so the pinned head's position
 * can be read), then change `viewKey`. In the layout pass after the swap
 * the page is scrolled so the card's top lands exactly where the pinned
 * head stood — the title row and view pill don't move on screen — and the
 * card's height glides from the old table's to the new one's so the
 * content beneath slides up instead of jumping.
 */
export function useCostViewSwitch(ref: RefObject<HTMLDivElement | null>, viewKey: string) {
  const pending = useRef<{ scrollTop: number; height: number } | null>(null)

  const beforeSwitch = () => {
    const card = ref.current?.querySelector<HTMLElement>(".jcd-cost-widget")
    const page = card?.closest<HTMLElement>(".page")
    const head = card?.querySelector<HTMLElement>(".widget-header")
    if (!card || !page || !head || !card.classList.contains("jcd-cost-head-pinned")) {
      pending.current = null
      return
    }
    const cardTop = card.getBoundingClientRect().top
    const headTop = head.getBoundingClientRect().top
    // Unpinned, the head's top coincides with the card's top (its margin
    // absorbs the card padding), so scrolling by the gap between the two
    // puts the card's top where the docked head is now.
    pending.current = { scrollTop: page.scrollTop + (cardTop - headTop), height: card.offsetHeight }
  }

  useLayoutEffect(() => {
    const p = pending.current
    pending.current = null
    if (!p) return
    const card = ref.current?.querySelector<HTMLElement>(".jcd-cost-widget")
    const page = card?.closest<HTMLElement>(".page")
    if (!card || !page) return
    page.scrollTop = Math.max(0, p.scrollTop)
    const next = card.offsetHeight
    if (Math.abs(next - p.height) < 1 || typeof card.animate !== "function") return
    card.animate(
      [{ height: `${p.height}px` }, { height: `${next}px` }],
      { duration: 320, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey])

  return beforeSwitch
}
