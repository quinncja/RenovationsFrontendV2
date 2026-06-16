import fetchWithRetry from "../utils/fetchWithRetry"
import fetchWithTimeout, { type TimeoutOptions } from "../utils/fetchWithTimeout"
import { auth } from "../../core/auth/firebase"

// Trim any trailing slash so leading-slash paths below don't produce "//".
const API_BASE_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "")

// Opening/closing the backend SQL connection can legitimately take longer than
// a normal read, and re-firing a connect mid-handshake is unsafe — so these get
// a longer timeout that does NOT retry on timeout.
const CONNECT_TIMEOUT: TimeoutOptions = { timeoutMs: 20000, retryOnTimeout: false }

async function authedFetch(
  path: string,
  method: "GET" | "POST" = "GET",
  timeout?: TimeoutOptions
) {
  return fetchWithRetry(async () => {
    const token = await auth.currentUser?.getIdToken()

    const response = await fetchWithTimeout(
      `${API_BASE_URL}${path}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      timeout
    )

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`) as Error & { status: number }
      error.status = response.status
      throw error
    }

    return response.json()
  })
}

export async function fetchSqlStatus(): Promise<boolean> {
  const data = await authedFetch("/admin/sql-status")
  return data.connected
}

export async function connectSql(): Promise<void> {
  await authedFetch("/admin/sql-connect", "POST", CONNECT_TIMEOUT)
}

export async function disconnectSql(): Promise<void> {
  await authedFetch("/admin/sql-disconnect", "POST", CONNECT_TIMEOUT)
}
