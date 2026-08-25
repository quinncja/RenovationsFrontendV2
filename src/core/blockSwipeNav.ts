/**
 * Keep horizontal trackpad scrolls from becoming browser back/forward.
 *
 * WebKit derives its swipe-navigation gesture from the wheel stream and
 * ignores `overscroll-behavior` once a nested scroller (the projections grid,
 * summary strips, wide tables) hits its edge. The only thing that reliably
 * cancels the gesture is preventDefault on the wheel events themselves, so
 * this swallows horizontal deltas that no ancestor scroller can absorb. The
 * app never scrolls horizontally at page level, so nothing legitimate is lost.
 */
export function installSwipeNavBlocker(): () => void {
  const scrollers = (start: Element | null): HTMLElement[] => {
    const out: HTMLElement[] = []
    for (let el = start; el && el !== document.body; el = el.parentElement) {
      const { overflowX } = getComputedStyle(el)
      if (overflowX !== "auto" && overflowX !== "scroll") continue
      if (el.scrollWidth - el.clientWidth > 0) out.push(el as HTMLElement)
    }
    return out
  }
  const canAbsorb = (els: HTMLElement[], dx: number): boolean =>
    els.some((el) => {
      const max = el.scrollWidth - el.clientWidth
      return dx < 0 ? el.scrollLeft > 0 : el.scrollLeft < max - 1
    })
  /* WebKit decides "this gesture is a navigation swipe" on the FIRST wheel
     event, and only if the nearest scroller is resting exactly on its edge —
     that first event can carry a zero delta, so direction alone can't catch
     it. Park every horizontal scroller 1px off its edges once a gesture has
     ENDED, so the next one always begins as a scroll, never as a swipe.

     Never write scrollLeft while a gesture is in flight: on WebKit a
     programmatic scrollLeft write cancels the async (momentum) scroll, and
     doing it on every wheel tick at an edge made the strip snap, stall and
     stutter (the summary's horizontal scroll was unusable in Safari). The
     write waits for the wheel stream to go quiet instead. */
  const GESTURE_QUIET_MS = 150
  let quietTimer: number | undefined
  let pending: HTMLElement[] = []
  const parkOffEdges = () => {
    quietTimer = undefined
    const els = pending
    pending = []
    for (const el of els) {
      if (!el.isConnected) continue
      const max = el.scrollWidth - el.clientWidth
      if (max < 2) continue
      if (el.scrollLeft <= 0) el.scrollLeft = 1
      else if (el.scrollLeft >= max) el.scrollLeft = max - 1
    }
  }
  const scheduleParking = (els: HTMLElement[]) => {
    for (const el of els) if (!pending.includes(el)) pending.push(el)
    window.clearTimeout(quietTimer)
    quietTimer = window.setTimeout(parkOffEdges, GESTURE_QUIET_MS)
  }
  const onWheel = (e: WheelEvent) => {
    // Vertical gestures are left entirely alone: writing scrollLeft during a
    // vertical wheel cancels in-flight scrolling (the full-screen grid is
    // its own vertical scroller) and fights the header's scroll handler.
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
    const els = scrollers(e.target as Element | null)
    if (!canAbsorb(els, e.deltaX)) e.preventDefault()
    if (els.length) scheduleParking(els)
  }
  window.addEventListener("wheel", onWheel, { passive: false })
  return () => {
    window.removeEventListener("wheel", onWheel)
    window.clearTimeout(quietTimer)
  }
}
