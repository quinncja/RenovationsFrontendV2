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

export interface UserEngagement {
  rangeDays: number
  topWidgets: WidgetEngagement[]
  topPages: PageEngagement[]
  sessionCount: number
  /** All-time sessions (bounded by 180-day raw-event retention). */
  totalSessionCount: number
  daily: Array<{ date: string; count: number }>
}

export interface CompanyEngagement {
  rangeDays: number
  topWidgets: WidgetEngagement[]
  topPages: PageEngagement[]
  activeUsers: number
  /** Company-wide API requests (mirrors the per-user activity shape). */
  activity: {
    total: number
    thisMonth: number
    last30Days: Array<{ date: string; count: number }>
  }
  /** Distinct sessions across users in the last 30 days. */
  sessionCount: number
  /** All-time distinct sessions (bounded by 180-day raw-event retention). */
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
  return authGet(`/analytics/user/${userId}?range=${range}`)
}

export function fetchCompanyEngagement(range = 30): Promise<CompanyEngagement> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  return authGet(`/analytics/company?range=${range}&timezone=${encodeURIComponent(tz)}`)
}
