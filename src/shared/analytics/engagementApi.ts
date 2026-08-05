// Read-side client for engagement insights (gated on the backend). Mirrors the
// auth-header handling used elsewhere; the user/company endpoints 403 for callers
// whose Firebase role is not `owner` or `tech`.
import { auth } from "../../core/auth/firebase"

const API_BASE_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "")

export interface WidgetEngagement {
  widgetId: string
  section: string | null
  hoverCount: number
  totalDwellMs: number
  avgDwellMs: number
  clickCount: number
  tooltipCount: number
  userCount?: number // company view only
}

export interface PageEngagement {
  page: string
  visits: number
  lastVisit?: string
  userCount?: number // company view only
}

export interface ProjectEngagement {
  recnum: string
  name: string | null
  views: number
  /** Full job-detail page opens. Absent until the backend split ships. */
  pageViews?: number
  /** Inline expands from the Job Costing table. Absent until the backend split ships. */
  widgetViews?: number
  lastViewed?: string
  userCount?: number // company view only
}

/** One reconstructed browsing session, most-recent first — ALL sessions, brief
 * visits included; `engaged` is a classification, not an admission rule. Counts
 * are exact; the enumerated `pages`/`projects`/`widgets` lists are capped
 * server-side. Fields marked optional are absent from a pre-cutover backend. */
export interface SessionSummary {
  sessionId: string
  startedAt: string
  /** Last event's timestamp — with startedAt, bounds the session. */
  endedAt?: string
  /** endedAt − startedAt. 0 for a single-event session. */
  durationMs?: number
  /** Backend API requests made during this session. */
  apiRequests?: number
  /** ≥1 interaction, or navigated past the landing page (>1 page view). */
  engaged?: boolean
  /** Total page navigations (incl. repeats). */
  pageViews: number
  /** Deliberate interaction events (widget hover/click, tooltip, project open). */
  interactions: number
  /** Distinct pages visited. */
  pageCount: number
  /** Distinct projects opened. */
  projectCount: number
  /** Distinct widgets engaged. */
  widgetCount: number
  /** First route landed on this session (null if none recorded). */
  entryPage: string | null
  /** Ordered page path, consecutive repeats collapsed. */
  pages: string[]
  projects: Array<{ recnum: string; name: string | null }>
  widgets: Array<{ widgetId: string; section: string | null }>
}

export interface UserEngagement {
  rangeDays: number
  topWidgets: WidgetEngagement[]
  topPages: PageEngagement[]
  topProjects: ProjectEngagement[]
  /** ALL sessions in the range window, brief visits included. */
  sessionCount: number
  /** Sessions with real engagement (interaction or >1 page view). */
  engagedSessionCount?: number
  /** True all-time sessions (from the daily rollups — no retention bound). */
  totalSessionCount: number
  /** Range-window activity breakdown (from rollups). */
  interactions?: number
  pageViews?: number
  apiRequests?: number
  daily: Array<{ date: string; count: number }>
  /** Most recent individual sessions with per-session activity detail. */
  sessions: SessionSummary[]
}

export interface CompanyEngagement {
  rangeDays: number
  topWidgets: WidgetEngagement[]
  topPages: PageEngagement[]
  topProjects: ProjectEngagement[]
  activeUsers: number
  /** Company-wide API requests (mirrors the per-user activity shape). */
  activity: {
    total: number
    thisMonth: number
    last30Days: Array<{ date: string; count: number }>
  }
  /** Distinct sessions across users in the last 30 days (brief included). */
  sessionCount: number
  /** Sessions with real engagement (interaction or >1 page view). */
  engagedSessionCount?: number
  /** True all-time distinct sessions (from the daily rollups). */
  totalSessionCount: number
}

async function authGet<T>(path: string): Promise<T> {
  const token = await auth.currentUser?.getIdToken()
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`) as Error & { status: number }
    err.status = res.status
    throw err
  }
  return res.json()
}

export function fetchAnalyticsAccess(): Promise<{ isAnalyticsAdmin: boolean }> {
  return authGet("/analytics/access")
}

export function fetchUserEngagement(userId: string, range = 30): Promise<UserEngagement> {
  // Timezone matters: the daily trend renders next to the API-activity chart
  // (also viewer-timezone) — bucketing one in UTC made evening activity land on
  // different days in the two charts.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  return authGet(`/analytics/user/${userId}?range=${range}&timezone=${encodeURIComponent(tz)}`)
}

export function fetchCompanyEngagement(range = 30): Promise<CompanyEngagement> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  return authGet(`/analytics/company?range=${range}&timezone=${encodeURIComponent(tz)}`)
}
