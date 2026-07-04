import fetchWithRetry from "../utils/fetchWithRetry"
import fetchWithTimeout from "../utils/fetchWithTimeout"
import { auth } from "../../core/auth/firebase"
import { sessionTrackingHeaders } from "../analytics/analytics"
import type { DashboardLayout } from "../../modules/dashboard/types/dashboardLayout"

// Trim any trailing slash so the leading-slash paths below don't produce "//".
const API_BASE_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "")

export async function fetchDashboardLayout(): Promise<DashboardLayout | null> {
  return fetchWithRetry(async () => {
    const token = await auth.currentUser?.getIdToken()

    const response = await fetchWithTimeout(`${API_BASE_URL}/user/dashboard-layout`, {
      method: "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...sessionTrackingHeaders(),
      },
    })

    if (response.status === 404) return null

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`) as Error & { status: number }
      error.status = response.status
      throw error
    }

    return response.json()
  })
}

export async function saveDashboardLayout(layout: DashboardLayout): Promise<void> {
  return fetchWithRetry(async () => {
    const token = await auth.currentUser?.getIdToken()

    const response = await fetchWithTimeout(`${API_BASE_URL}/user/dashboard-layout`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...sessionTrackingHeaders(),
      },
      body: JSON.stringify(layout),
    })

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`) as Error & { status: number }
      error.status = response.status
      throw error
    }
  })
}
