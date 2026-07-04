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
  | "project_view"
  | "session_start"

/** How a project was opened: full job-detail page vs inline table expand. */
export type ProjectViewSource = "page" | "widget"

export interface TrackInput {
  type: EngagementType
  page?: string | null
  widgetId?: string | null
  section?: string | null
  projectRecnum?: string | null
  projectName?: string | null
  source?: ProjectViewSource | null
  durationMs?: number | null
}

interface QueuedEvent extends TrackInput {
  ts: string
}

// ─── Tunables ───────────────────────────────────────────────────────────────
const FLUSH_INTERVAL_MS = 15_000
const MAX_QUEUE = 200          // hard cap; also the backend's per-batch limit and
                               // keeps keepalive bodies under the browser's 64KB cap
const RETRY_BACKOFF_MS = 10_000 // after a failed flush, wait before retrying
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

// ─── Session "begun" gate ─────────────────────────────────────────────────────
// A session has "begun" once the user does anything real: a tracked interaction,
// navigation past the landing page (>1 page_view), or ANY raw gesture
// (pointerdown/keydown — see initAnalytics). The automatic session_start + first
// page_view of a bare page load do NOT begin a session. Until a session begins,
// API requests are NOT counted toward the user's activity (see
// sessionTrackingHeaders), so the initial-page-load request burst never inflates
// the api count. The gesture path exists for touch users: they never produce
// mouse hovers, and a phone user who scrolls and reads is still "using the app"
// for last-seen purposes. The backend's countEngagedSessions() stays stricter —
// it needs a tracked interaction event or a second page_view.
const SESSION_BEGIN_TYPES: EngagementType[] = [
  "widget_hover",
  "widget_click",
  "tooltip_open",
  "project_view",
]
let pageViewCount = 0
let sessionActive = false

// ─── Public API ───────────────────────────────────────────────────────────────

export function track(ev: TrackInput) {
  if (!started) return
  if (!sessionActive) {
    if (ev.type === "page_view") {
      if (++pageViewCount > 1) sessionActive = true
    } else if (SESSION_BEGIN_TYPES.includes(ev.type)) {
      sessionActive = true
    }
  }
  queue.push({ ...ev, ts: new Date().toISOString() })
  // Enforce the cap even while flushing is blocked (no token yet / backend
  // down): drop the OLDEST events so the queue can't grow unboundedly and a
  // late flush never exceeds the backend's per-batch limit.
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE)
  if (queue.length >= MAX_QUEUE) void flush()
}

/**
 * Header attached to backend API requests once the analytics session has begun
 * (see the gate above). The backend only records a request toward the user's
 * activity count when this header is present, so the automatic burst fired by the
 * initial page load — before any real interaction — never inflates the count.
 * Returns an empty object until the session begins. Synchronous so it can be
 * spread directly into a request's header object.
 */
export function sessionTrackingHeaders(): Record<string, string> {
  return sessionActive ? { "X-RD-Session-Active": "1" } : {}
}

export function trackPageView(page: string) {
  track({ type: "page_view", page })
}

/**
 * Record that a user opened a specific job. `source` distinguishes a full
 * job-detail page open ("page", the default) from an inline expand in the Job
 * Costing table ("widget").
 */
export function trackProjectView(recnum: string, name: string, source: ProjectViewSource = "page") {
  track({
    type: "project_view",
    projectRecnum: recnum,
    projectName: name,
    source,
    page: window.location.pathname,
  })
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

  // Any real user gesture begins the session for API-call counting — the only
  // signal touch users reliably produce (see the session-gate comment above).
  const markActive = () => { sessionActive = true }
  window.addEventListener("pointerdown", markActive, { once: true, capture: true })
  window.addEventListener("keydown", markActive, { once: true, capture: true })

  // Flush on tab-hide / unload — these are the reliable "user is leaving" signals.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { endHover(); void flush(true) }
  })
  window.addEventListener("pagehide", () => { endHover(); void flush(true) })

  track({ type: "session_start" })
  initWidgetTracking()
}

// ─── Flush ──────────────────────────────────────────────────────────────────

// Posted to /usage/events (alias of /analytics/events) because ad-blocker
// filter lists commonly match "/analytics/" URLs and would silently kill the
// whole pipeline for anyone running one.
let lastFailureAt = 0

function requeue(batch: QueuedEvent[]) {
  lastFailureAt = Date.now()
  // Batch goes back at the front (it's the oldest); trim from the front so the
  // newest events always survive the cap.
  queue = [...batch, ...queue].slice(-MAX_QUEUE)
}

async function flush(keepalive = false) {
  if (queue.length === 0) return
  if (!keepalive && Date.now() - lastFailureAt < RETRY_BACKOFF_MS) return

  // Prefer a fresh token — cachedToken can be stale after a long-idle tab
  // (Firebase only refreshes when something calls getIdToken()). During
  // pagehide (keepalive) async token fetches may never resolve, so use the
  // cache as-is there.
  let token = cachedToken
  if (!DEV_BYPASS && !keepalive) {
    try {
      token = (await auth.currentUser?.getIdToken()) ?? cachedToken
      if (token) cachedToken = token
    } catch { /* fall back to cached */ }
  }

  // No identity yet (token not loaded, not dev) — keep events queued (capped).
  if (!DEV_BYPASS && !token) return

  const batch = queue
  queue = []

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (!DEV_BYPASS && token) headers.Authorization = `Bearer ${token}`

  try {
    const res = await fetch(`${API_BASE_URL}usage/events`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId, events: batch }),
      keepalive,
    })
    if (res.ok) {
      lastFailureAt = 0
      return
    }
    // Auth failures (stale token) and server errors are retryable next cycle;
    // any other 4xx means the payload itself was rejected — drop it.
    if (res.status === 401 || res.status === 403 || res.status >= 500) requeue(batch)
  } catch {
    requeue(batch) // network failure — retry next interval, never retry-storm
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
  tooltipFired: boolean
  timer: ReturnType<typeof setTimeout>
}

/**
 * Called by chart components whenever a data tooltip renders. Attributed to the
 * widget currently under the cursor and deduped to ONE event per hover-visit,
 * so slice-to-slice cursor movement inside a chart doesn't spam events.
 */
export function notifyTooltipOpen() {
  if (!hover || hover.tooltipFired) return
  hover.tooltipFired = true
  track({
    type: "tooltip_open",
    widgetId: hover.widgetId,
    section: hover.section,
    page: window.location.pathname,
  })
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
  hover = { el, widgetId, section, enterTime, engaged: false, tooltipFired: false, timer }
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
