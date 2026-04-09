import fetchWithRetry from "../utils/fetchWithRetry"
import { auth } from "../../core/auth/firebase"

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api"

async function authedFetch(path: string, method: "GET" | "POST" = "GET") {
  return fetchWithRetry(async () => {
    const token = await auth.currentUser?.getIdToken()

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

export async function fetchSqlStatus(): Promise<boolean> {
  const data = await authedFetch("/admin/sql-status")
  return data.connected
}

export async function connectSql(): Promise<void> {
  await authedFetch("/admin/sql-connect", "POST")
}

export async function disconnectSql(): Promise<void> {
  await authedFetch("/admin/sql-disconnect", "POST")
}
