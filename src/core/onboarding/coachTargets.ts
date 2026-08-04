// Registry letting deeply-nested components expose a real DOM element to the
// app-level onboarding host without context plumbing or document.querySelector.
// Owning components register their element via a callback ref; the host reads
// it with useCoachTarget, re-rendering only when that id's element changes.

import { useCallback, useSyncExternalStore } from "react"

export type CoachTargetId =
  | "edit-gear"
  | "wip-toggle"
  | "nav-jobcost"
  | "nav-finances"
  // The navbar root — measured (not spotlighted) by overlays that cover the
  // page content and must stop at the nav's live edge.
  | "navbar"
  // Job Costing interactive tour (JobcostIntro): the taught board controls.
  | "jc-view-seg"
  | "jc-card"
  | "jc-card-pin"
  // The command bar's joined Year + Phase pair (the "when" control).
  | "jc-when"

const targets = new Map<CoachTargetId, HTMLElement>()
const listeners = new Map<CoachTargetId, Set<() => void>>()

/** Callback-ref handler: pass `el` straight through from React. Callback refs
 *  fire the old ref with `null` before the new one with the mounted element,
 *  so set/delete in that order is naturally race-free across re-renders and
 *  unmounts — no need to guard against a stale unregister clobbering a fresh one. */
export function registerCoachTarget(id: CoachTargetId, el: HTMLElement | null): void {
  if (el) {
    targets.set(id, el)
  } else {
    targets.delete(id)
  }
  listeners.get(id)?.forEach((fn) => fn())
}

/** Instance-safe callback ref for targets whose owner can change identity
 *  while both instances are briefly mounted (an AnimatePresence swap: the
 *  entering owner registers before the exiting one unmounts). The plain
 *  register would let the old instance's trailing `null` delete the new
 *  registration; this ref only deletes what IT registered. Memoize per
 *  component instance (useMemo) so React sees a stable ref identity. */
export function coachTargetRef(id: CoachTargetId): (el: HTMLElement | null) => void {
  let mine: HTMLElement | null = null
  return (el) => {
    if (el) {
      mine = el
      targets.set(id, el)
    } else {
      if (mine && targets.get(id) === mine) targets.delete(id)
      mine = null
    }
    listeners.get(id)?.forEach((fn) => fn())
  }
}

export function useCoachTarget(id: CoachTargetId): HTMLElement | null {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let set = listeners.get(id)
      if (!set) {
        set = new Set()
        listeners.set(id, set)
      }
      set.add(onStoreChange)
      return () => set.delete(onStoreChange)
    },
    [id]
  )
  const getSnapshot = useCallback(() => targets.get(id) ?? null, [id])
  return useSyncExternalStore(subscribe, getSnapshot)
}
