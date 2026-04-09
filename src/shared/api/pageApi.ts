import fetchWithRetry from "../utils/fetchWithRetry"
import { auth } from "../../core/auth/firebase"

export type ModuleName = "dashboard" | "company" | "users" | "jobcost" | "clients" | "suppliers" | "subcontractors" | "invoices"

export type PageQueries = readonly string[]

export interface PageParams {
  [key: string]: string | number | boolean | null
}

export interface FetchPageDataOptions {
  module: ModuleName
  queries: PageQueries
  params?: PageParams
  signal?: AbortSignal
}

export interface PageDataResponse {
  [queryName: string]: unknown
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api"

export async function fetchPageData(
  options: FetchPageDataOptions
): Promise<PageDataResponse> {
  const { module, queries, params = {}, signal } = options

  return fetchWithRetry(async () => {
    const token = await auth.currentUser?.getIdToken()

    const response = await fetch(`${API_BASE_URL}/page/${module}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ queries, params }),
      signal,
    })

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`) as Error & { status: number }
      error.status = response.status
      throw error
    }

    const result: PageDataResponse = await response.json()

    // Strip server-side query errors ({ __error: "..." }) → null
    // so consumers safely fall through to empty/no-data states.
    for (const key of Object.keys(result)) {
      const val = result[key]
      if (val && typeof val === "object" && "__error" in (val as Record<string, unknown>)) {
        result[key] = null
      }
    }

    return result
  })
}
