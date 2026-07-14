import fetchWithRetry from "../utils/fetchWithRetry"
import fetchWithTimeout from "../utils/fetchWithTimeout"
import { auth } from "../../core/auth/firebase"
import { sessionTrackingHeaders } from "../analytics/analytics"
import type { DashboardLayout } from "../../modules/dashboard/types/dashboardLayout"

// Trim any trailing slash so the leading-slash paths below don't produce "//".
const API_BASE_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "")

/** Server-backed onboarding state (see UserPreference.onboarding). Absent for a
 *  user who has never onboarded — GET returns null in that slot. */
export interface OnboardingPrefs {
  onboardedAt: string | null
  milestones: Record<string, string>
}

/** The combined per-user preference payload — one fetch feeds both the dashboard
 *  layout provider (data) and the onboarding provider (presence + milestones). */
export interface UserPreferences {
  dashboardLayout: DashboardLayout | null
  onboarding: OnboardingPrefs | null
}

// GET /user/preferences always 200s, with nulls for fields the user hasn't set —
// so unlike the layout 404, any non-ok here is a real error and throws.
export async function fetchUserPreferences(): Promise<UserPreferences> {
  return fetchWithRetry(async () => {
    const token = await auth.currentUser?.getIdToken()

    const response = await fetchWithTimeout(`${API_BASE_URL}/user/preferences`, {
      method: "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...sessionTrackingHeaders(),
      },
    })

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`) as Error & { status: number }
      error.status = response.status
      throw error
    }

    return response.json()
  })
}

// PATCH /user/onboarding union-merges milestones (first ack wins) and sets
// onboardedAt only if not already set server-side. Best-effort — callers fire it
// in the background and swallow failures (mirrors saveDashboardLayout).
export async function patchOnboarding(body: {
  onboardedAt?: string
  milestones?: Record<string, string>
}): Promise<void> {
  return fetchWithRetry(async () => {
    const token = await auth.currentUser?.getIdToken()

    const response = await fetchWithTimeout(`${API_BASE_URL}/user/onboarding`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...sessionTrackingHeaders(),
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`) as Error & { status: number }
      error.status = response.status
      throw error
    }
  })
}
