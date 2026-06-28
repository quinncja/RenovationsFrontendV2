// Engagement analytics client — a tiny buffered event pipeline that records how
// users actually interact with the app (page visits, intentional widget hover
// dwell, clicks) and flushes them to the backend in batches. Mirrors the
// auth-header handling of shared/api/* so it works under DEV_BYPASS too.
//
// Identity is NEVER sent from here — the backend stamps userId from the verified
// token. We only send the event shape + a per-load sessionId.

import { auth } from "../../core/auth/firebase"
import { onIdTokenChanged } from "firebase/auth"

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/"
const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === "true"

export type EngagementType =
  | "page_view"
  | "widget_hover"
  | "widget_click"
  | "tooltip_open"
  | "session_start"

export interface TrackInput {
  type: EngagementType
  page?: string | null
  widgetId?: string | null
  section?: string | null
  durationMs?: number | null
}

interface QueuedEvent extends TrackInput {
  ts: string
}

// ─── Tunables ───────────────────────────────────────────────────────────────
const FLUSH_INTERVAL_MS = 15_000
const MAX_QUEUE = 200          // hard cap so a failing backend can't grow memory
const ENGAGE_MS = 1_000        // dwell must exceed this to count as engagement
const MAX_DWELL_MS = 120_000   // cap a single hover (idle-away / forgotten tab)
const SCROLL_IDLE_MS = 150     // scrolling "ends" this long after the last event

// ─── State ──────────────────────────────────────────────────────────────────
const sessionId =
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(36).slice(2)

let queue: QueuedEvent[] = []
let cachedToken: string | null = null
let started = false

// ─── Public API ───────────────────────────────────────────────────────────────

export function track(ev: TrackInput) {
  if (!started) return
  queue.push({ ...ev, ts: new Date().toISOString() })
  if (queue.length >= MAX_QUEUE) void flush()
}

export function trackPageView(page: string) {
  track({ type: "page_view", page })
}

/** Mount once (after auth). Idempotent. */
export function initAnalytics() {
  if (started) return
  started = true

  // Keep a fresh token so the keepalive flush on pagehide can build headers
  // synchronously (getIdToken() is async and may not resolve during unload).
  if (!DEV_BYPASS) {
    onIdTokenChanged(auth, (user) => {
      if (user) user.getIdToken().then((t) => { cachedToken = t }).catch(() => {})
      else cachedToken = null
    })
  }

  setInterval(() => { void flush() }, FLUSH_INTERVAL_MS)

  // Flush on tab-hide / unload — these are the reliable "user is leaving" signals.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { endHover(); void flush(true) }
  })
  window.addEventListener("pagehide", () => { endHover(); void flush(true) })

  track({ type: "session_start" })
  initWidgetTracking()
}

// ─── Flush ──────────────────────────────────────────────────────────────────

async function flush(keepalive = false) {
  if (queue.length === 0) return

  // No identity yet (token not loaded, not dev) — keep events queued (capped).
  if (!DEV_BYPASS && !cachedToken) return

  const batch = queue
  queue = []

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (!DEV_BYPASS && cachedToken) headers.Authorization = `Bearer ${cachedToken}`

  try {
    await fetch(`${API_BASE_URL}analytics/events`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId, events: batch }),
      keepalive,
    })
  } catch {
    // Best-effort telemetry — drop on failure rather than retry-storm or leak.
  }
}

// ─── Widget engagement (document-level delegation) ──────────────────────────
// One set of listeners covers every widget in both dashboard layouts via the
// data-widget-id / data-section-id attributes on each .widget-slot — no
// per-widget React overhead, and it survives re-renders/layout swaps.

interface HoverState {
  el: Element
  widgetId: string
  section: string | null
  enterTime: number
  engaged: boolean
  timer: ReturnType<typeof setTimeout>
}

let hover: HoverState | null = null
let isScrolling = false
let scrollTimer: ReturnType<typeof setTimeout> | null = null

function widgetOf(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  return target.closest<HTMLElement>("[data-widget-id]")
}

function beginHover(el: HTMLElement) {
  const widgetId = el.dataset.widgetId
  if (!widgetId) return
  const section = el.dataset.sectionId ?? null
  const enterTime = performance.now()
  const timer = setTimeout(() => { if (hover) hover.engaged = true }, ENGAGE_MS)
  hover = { el, widgetId, section, enterTime, engaged: false, timer }
}

function endHover() {
  if (!hover) return
  clearTimeout(hover.timer)
  if (hover.engaged) {
    const dwell = Math.min(performance.now() - hover.enterTime, MAX_DWELL_MS)
    track({
      type: "widget_hover",
      widgetId: hover.widgetId,
      section: hover.section,
      page: window.location.pathname,
      durationMs: Math.round(dwell),
    })
  }
  hover = null
}

function initWidgetTracking() {
  // Scroll guard (capture phase catches scroll from any inner scroller, since
  // scroll doesn't bubble). A widget passing under a stationary cursor during a
  // scroll shouldn't register as an intentional hover.
  window.addEventListener(
    "scroll",
    () => {
      isScrolling = true
      if (scrollTimer) clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => { isScrolling = false }, SCROLL_IDLE_MS)
    },
    { passive: true, capture: true },
  )

  window.addEventListener("blur", endHover)

  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return
    const el = widgetOf(e.target)
    if (!el || el === hover?.el) return
    endHover()                 // close any previous widget's hover
    if (isScrolling) return    // ignore scroll-driven enters
    beginHover(el)
  })

  document.addEventListener("pointerout", (e) => {
    if (e.pointerType !== "mouse") return
    if (!hover) return
    // Only end when truly leaving the tracked widget (not moving between its
    // own descendants).
    if (widgetOf(e.target) !== hover.el) return
    const to = e.relatedTarget
    if (to instanceof Node && hover.el.contains(to)) return
    endHover()
  })

  document.addEventListener("click", (e) => {
    const el = widgetOf(e.target)
    if (!el?.dataset.widgetId) return
    track({
      type: "widget_click",
      widgetId: el.dataset.widgetId,
      section: el.dataset.sectionId ?? null,
      page: window.location.pathname,
    })
  })
}
