// Channel between the interactive Job Costing tour (JobcostIntro, mounted in
// App.tsx outside the lazy Jobcost chunk) and the board itself. The board
// publishes the snapshot of state the tour advances on, and registers a small
// controller for the tour's escape-hatch actions ("Next" performs the taught
// action) and the end-of-tour restore. Same passive-registry shape as
// coachTargets: no context plumbing, useSyncExternalStore on the reading side.

import { useCallback, useSyncExternalStore } from "react"

export interface JobcostTourState {
  /** The EFFECTIVE view (grouped is desktop-only). */
  view: "grouped" | "list"
  loading: boolean
  /** Property groups currently rendered (post-filter). */
  groupCount: number
  openGroupKey: string | null
  openKind: "phases" | "oneoffs" | null
  /** Property-view pin keys, in pin order. */
  pins: string[]
}

export interface JobcostTourController {
  setView(mode: "grouped" | "list"): void
  openFirstGroup(): void
  openKind(kind: "phases" | "oneoffs"): void
  /** Navigate to the first (or open) property's full report. */
  openProperty(): void
  togglePinFirst(): void
  /** End-of-tour reset: reinstate the pre-tour pins/view, collapse any open
   *  card. The tour's interactions were a lesson, not a decision. */
  restore(baseline: { view: "grouped" | "list"; pins: string[] }): void
}

let state: JobcostTourState | null = null
let controller: JobcostTourController | null = null
const listeners = new Set<() => void>()

// Tour → board direction: lets the board know an interactive tour beat is
// running so it can block a navigate-away action (opening a property report)
// instead of letting the tour graduate/abort silently underneath it.
let tourActive = false
const activeListeners = new Set<() => void>()

/** Tour-side: publish whether an interactive coach beat is currently running. */
export function publishTourActive(active: boolean): void {
  if (tourActive === active) return
  tourActive = active
  activeListeners.forEach((fn) => fn())
}

/** Board-side: whether the tour is mid-beat right now. */
export function useTourActive(): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    activeListeners.add(onStoreChange)
    return () => activeListeners.delete(onStoreChange)
  }, [])
  return useSyncExternalStore(subscribe, () => tourActive)
}

// Tour → board: the coachmark card's current viewport centerX/top, so a
// board-side element (the "finish the tour" nudge) can align to the exact
// same spot the card itself is drawn at, instead of re-deriving it.
export interface TourCardPos {
  centerX: number
  top: number
}
let tourCardPos: TourCardPos | null = null
const posListeners = new Set<() => void>()

export function publishTourCardPos(pos: TourCardPos | null): void {
  if (
    tourCardPos === pos ||
    (tourCardPos && pos && tourCardPos.centerX === pos.centerX && tourCardPos.top === pos.top)
  ) {
    return
  }
  tourCardPos = pos
  posListeners.forEach((fn) => fn())
}

export function useTourCardPos(): TourCardPos | null {
  const subscribe = useCallback((onStoreChange: () => void) => {
    posListeners.add(onStoreChange)
    return () => posListeners.delete(onStoreChange)
  }, [])
  return useSyncExternalStore(subscribe, () => tourCardPos)
}

function shallowEq(a: JobcostTourState, b: JobcostTourState): boolean {
  return (
    a.view === b.view &&
    a.loading === b.loading &&
    a.groupCount === b.groupCount &&
    a.openGroupKey === b.openGroupKey &&
    a.openKind === b.openKind &&
    a.pins === b.pins
  )
}

/** Board-side: publish the latest snapshot (null on unmount). */
export function publishJobcostTourState(next: JobcostTourState | null): void {
  if (state != null && next != null && shallowEq(state, next)) return
  state = next
  listeners.forEach((fn) => fn())
}

export function registerJobcostTourController(c: JobcostTourController | null): void {
  controller = c
}

export function getJobcostTourController(): JobcostTourController | null {
  return controller
}

/** Tour-side: the board's live snapshot, null while /jobcost isn't mounted. */
export function useJobcostTourState(): JobcostTourState | null {
  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange)
    return () => listeners.delete(onStoreChange)
  }, [])
  return useSyncExternalStore(subscribe, () => state)
}
