// Engagement analytics client — a buffered event pipeline that records how
// users actually interact with the app (page visits, intentional widget hover
// dwell, clicks) and flushes them to the backend in batches.
//
// Design principles (mirrors industry analytics SDKs):
//  · SESSION = IDENTITY, NOT A QUALITY BAR. A session ID is minted on first
//    activity, persisted in localStorage, shared across tabs, and expires after
//    30 minutes of inactivity. Every session exists the moment its first event
//    lands; whether it was "engaged" is classified server-side at read time.
//  · CAPTURE IS TOTAL. Every backend API request carries the session ID via
//    X-RD-Session-Id (see sessionTrackingHeaders) — there is no client-side
//    "does this count" gate. The backend records requests as server-class
//    events in the same stream, so sessions and request counts reconcile.
//  · DELIVERY IS DURABLE. The unflushed queue mirrors to localStorage on every
//    change; a keepalive flush fires on tab-hide, and whatever still couldn't
//    be sent is replayed by the next app load. (sendBeacon is not usable here —
//    it cannot carry the Authorization header the ingest endpoint requires.)
//
// Identity is NEVER sent from here — the backend stamps userId from the
// verified token. We only send the event shape + session IDs.

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
  /** Stamped per event — the session can rotate mid-load, and replayed events
   *  belong to the session that produced them. */
  sessionId: string
}

// ─── Tunables ───────────────────────────────────────────────────────────────
const FLUSH_INTERVAL_MS = 15_000
const MAX_QUEUE = 200          // hard cap; also the backend's per-batch limit
const RETRY_BACKOFF_MS = 10_000 // after a failed flush, wait before retrying
const ENGAGE_MS = 1_000        // dwell must exceed this to count as engagement
const MAX_DWELL_MS = 120_000   // cap a single hover (idle-away / forgotten tab)
const SCROLL_IDLE_MS = 150     // scrolling "ends" this long after the last event

const SESSION_IDLE_MS = 30 * 60 * 1000 // 30-min inactivity ends a session
const REPLAY_STALE_MS = 60_000          // persisted queues older than this are
                                        // orphans from a dead tab — safe to replay

// ─── Session manager ────────────────────────────────────────────────────────
// One session shared across tabs via localStorage. Any activity — a tracked
// event or an API request going out — touches the session; 30 minutes without
// a touch expires it and the next activity mints a fresh one (queueing a
// session_start so the backend can count sessions from rollups alone).

const SESSION_KEY = "rd.analytics.session"

interface StoredSession {
  id: string
  startedAt: number
  lastActivity: number
}

function uuid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(36).slice(2)
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as StoredSession
    return typeof s?.id === "string" && typeof s?.lastActivity === "number" ? s : null
  } catch {
    return null
  }
}

function writeSession(s: StoredSession) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)) } catch { /* private mode */ }
}

// In-memory fallback when localStorage is unavailable.
let memorySession: StoredSession | null = null

/** Current session ID, touching (extending) the session. Mints a new session —
 *  and queues its session_start — when none exists or the last one went idle. */
function currentSessionId(): string {
  const now = Date.now()
  let s = readSession() ?? memorySession

  if (!s || now - s.lastActivity > SESSION_IDLE_MS) {
    s = { id: uuid(), startedAt: now, lastActivity: now }
    memorySession = s
    writeSession(s)
    // Direct enqueue (not track()) — track() would recurse into this function.
    enqueue({
      type: "session_start",
      page: typeof window !== "undefined" ? window.location.pathname : null,
      ts: new Date(now).toISOString(),
      sessionId: s.id,
    })
    return s.id
  }

  s.lastActivity = now
  memorySession = s
  writeSession(s)
  return s.id
}

/**
 * Header attached to every backend API request: the current analytics session
 * ID. The backend records each request as an `api_request` event tagged with
 * it, so per-session request counts line up with the engagement view. Always
 * present — capture is total; engagement is classified at read time.
 * Synchronous so it can be spread directly into a request's header object.
 */
export function sessionTrackingHeaders(): Record<string, string> {
  return { "X-RD-Session-Id": currentSessionId() }
}

// ─── Durable queue ──────────────────────────────────────────────────────────
// The in-memory queue mirrors to a per-tab localStorage key on every change.
// On boot, orphaned queues from dead tabs (stale beyond REPLAY_STALE_MS) are
// replayed, so events that missed their last flush still arrive — late but
// correctly timestamped (the backend accepts client timestamps up to a day
// old). The per-tab key means concurrent tabs never clobber each other.

const QUEUE_PREFIX = "rd.analytics.queue."
const tabQueueKey = QUEUE_PREFIX + uuid().slice(0, 8)

let queue: QueuedEvent[] = []
let cachedToken: string | null = null
let started = false

function persistQueue() {
  try {
    if (queue.length === 0) localStorage.removeItem(tabQueueKey)
    else localStorage.setItem(tabQueueKey, JSON.stringify({ savedAt: Date.now(), events: queue }))
  } catch { /* quota / private mode — in-memory queue still works */ }
}

function enqueue(ev: QueuedEvent) {
  queue.push(ev)
  // Enforce the cap even while flushing is blocked (no token yet / backend
  // down): drop the OLDEST events so the queue can't grow unboundedly and a
  // late flush never exceeds the backend's per-batch limit.
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE)
  persistQueue()
  if (queue.length >= MAX_QUEUE) void flush()
}

function replayOrphanedQueues() {
  try {
    const now = Date.now()
    const orphans: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(QUEUE_PREFIX) && key !== tabQueueKey) orphans.push(key)
    }
    for (const key of orphans) {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) { localStorage.removeItem(key); continue }
        const parsed = JSON.parse(raw) as { savedAt?: number; events?: QueuedEvent[] }
        // A fresh key may belong to a live tab still flushing — leave it alone.
        if (typeof parsed?.savedAt !== "number" || now - parsed.savedAt < REPLAY_STALE_MS) continue
        localStorage.removeItem(key)
        if (Array.isArray(parsed.events)) {
          for (const e of parsed.events) {
            if (e && typeof e.type === "string" && typeof e.sessionId === "string") queue.push(e)
          }
        }
      } catch {
        localStorage.removeItem(key)
      }
    }
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE)
    persistQueue()
  } catch { /* localStorage unavailable */ }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function track(ev: TrackInput) {
  if (!started) return
  enqueue({ ...ev, ts: new Date().toISOString(), sessionId: currentSessionId() })
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

  // Recover events a previous load couldn't deliver, then open this session
  // (minting + session_start if the last one went idle).
  replayOrphanedQueues()
  currentSessionId()

  setInterval(() => { void flush() }, FLUSH_INTERVAL_MS)

  // Flush on tab-hide / unload — these are the reliable "user is leaving"
  // signals. Whatever the keepalive request can't deliver stays persisted for
  // the next load's replay.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { endHover(); void flush(true) }
  })
  window.addEventListener("pagehide", () => { endHover(); void flush(true) })

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
  persistQueue()
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

  // No identity yet (token not loaded, not dev) — keep events queued; they're
  // persisted, so even a tab that dies here delivers via the next load's replay.
  if (!DEV_BYPASS && !token) return

  const batch = queue
  queue = []
  persistQueue() // optimistic: clears the mirror; a failed send re-persists below

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (!DEV_BYPASS && token) headers.Authorization = `Bearer ${token}`

  try {
    const res = await fetch(`${API_BASE_URL}usage/events`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId: batch[batch.length - 1]?.sessionId, events: batch }),
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
