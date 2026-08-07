import { useState, useEffect, useSyncExternalStore } from "react"

// ─── Modal stacking ──────────────────────────────────────────────────────────
//
// Every modal in the app renders the same `.modal-overlay` (backdrop) + `.modal`
// (content) pair via a portal to <body>, and historically both carried a fixed
// z-index (200 / 201). That breaks the moment two modals stack: the second
// modal's backdrop (200) lands *below* the first modal's content (201), so the
// previous modal bleeds through the new backdrop.
//
// `useModalLayer` fixes this generically. While a modal is open it claims a
// stacking slot; its backdrop and content get z-index values that sit a full
// step above every modal already open. Stack a third modal and it lands above
// the second, and so on.
//
// Slots are allocated lowest-free-first (not a naive counter) so that closing
// modals out of order never collides two open modals onto the same layer.

const BASE_Z = 200
// Gap between adjacent modal layers. 10 leaves room for a modal's own internal
// fixed children (popovers, sheets) between its backdrop and the next modal.
const LAYER_STEP = 10

const takenSlots = new Set<number>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const l of listeners) l()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// Highest currently-taken slot = the outermost open modal. Recomputed on
// every subscriber notification rather than cached, since the stack is
// shallow (a handful of slots at most) and this only runs on open/close.
function maxSlot(): number {
  let max = -1
  for (const s of takenSlots) if (s > max) max = s
  return max
}

function acquireSlot(): number {
  let slot = 0
  while (takenSlots.has(slot)) slot++
  takenSlots.add(slot)
  notify()
  return slot
}

function releaseSlot(slot: number): void {
  takenSlots.delete(slot)
  notify()
}

export interface ModalLayer {
  /** z-index for the `.modal-overlay` backdrop. */
  overlayZ: number
  /** z-index for the `.modal-positioner` (or the `.modal` itself when no positioner). */
  contentZ: number
  /**
   * True while this is the outermost open modal. Stacking N full-viewport
   * `backdrop-filter: blur()` layers is expensive and the cost compounds
   * with depth — but only the topmost overlay's blur is ever visible (it
   * blurs everything beneath it, including any blur the layers below already
   * applied), so lower layers can skip the filter for free. Each modal's
   * overlay should apply `backdrop-filter` only when `isTopLayer` is true.
   */
  isTopLayer: boolean
}

/**
 * Assigns a stacking layer to a modal for as long as it is open.
 *
 * @param active whether the modal is currently rendered/open. Pass the same
 *   condition the component uses to gate its portal (e.g. `open`, `!!invoiceId`).
 */
export function useModalLayer(active: boolean): ModalLayer {
  const [slot, setSlot] = useState<number | null>(null)

  useEffect(() => {
    if (!active) return
    const mine = acquireSlot()
    // Claiming a slot from the shared stack registry IS the external-system
    // synchronization an effect is for; the one extra render it triggers (to
    // apply the resolved z-index) is intentional and bounded to modal open.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlot(mine)
    return () => {
      releaseSlot(mine)
      setSlot(null)
    }
  }, [active])

  // Recomputed whenever any modal acquires/releases a slot, so the modal that
  // just lost "topmost" (a new one opened above it) re-renders and drops its
  // blur, and the one left on top after a close regains it.
  const currentMaxSlot = useSyncExternalStore(subscribe, maxSlot, maxSlot)

  const base = BASE_Z + (slot ?? 0) * LAYER_STEP
  return {
    overlayZ: base,
    contentZ: base + 1,
    isTopLayer: slot === null || slot === currentMaxSlot,
  }
}
