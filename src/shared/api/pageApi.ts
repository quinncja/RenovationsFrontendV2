import fetchWithRetry from "../utils/fetchWithRetry"
import fetchWithTimeout from "../utils/fetchWithTimeout"
import { auth } from "../../core/auth/firebase"

export type ModuleName =
  | "dashboard"
  | "businessSummary"
  | "jobcost"
  | "jobcostDetail"
  | "jobcostItems"
  | "cashflow"
  | "revenueMap"
  | "changeOrders"
  | "invoices"
  | "users"
  | "projects"
  | "projectListData"
  | "projectPhaseData"
  | "feedback"
  | "orgChart"

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

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/"

/** Maps frontend module names to RD backend endpoints */
const MODULE_ENDPOINTS: Record<ModuleName, string> = {
  dashboard: "home-data",
  businessSummary: "home-data",
  jobcost: "jobcost",
  // The /jobcost endpoint (loadJobcost) serves the createQueryMap queries
  // (getPhases, getBudgetByRecnum, getAllCostItems, …) keyed by `recnum`.
  // /jobcost-data is a different, fixed-shape endpoint that ignores `queries`.
  jobcostDetail: "jobcost",
  jobcostItems: "jobcost-items",
  cashflow: "home-data",
  revenueMap: "home-data",
  changeOrders: "change-orders",
  invoices: "home-data",
  users: "user-list",
  projects: "project-list",
  projectListData: "project-list-data",
  projectPhaseData: "project-phase-data",
  feedback: "feedback",
  orgChart: "monday/process-boards",
}

const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true'

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (DEV_BYPASS) {
    return { "Content-Type": "application/json" }
  }
  const token = await auth.currentUser?.getIdToken()
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function fetchPageData(
  options: FetchPageDataOptions
): Promise<PageDataResponse> {
  const { module, queries, params = {}, signal } = options
  const endpoint = MODULE_ENDPOINTS[module]

  return fetchWithRetry(async () => {
    const headers = await getAuthHeaders()

    // Build query string from queries + params
    const searchParams = new URLSearchParams()
    if (queries.length > 0) {
      searchParams.set("queries", queries.join(","))
    }
    for (const [key, value] of Object.entries(params)) {
      if (value != null) {
        searchParams.set(key, String(value))
      }
    }

    const queryString = searchParams.toString()
    const url = `${API_BASE_URL}${endpoint}${queryString ? `?${queryString}` : ""}`

    const response = await fetchWithTimeout(url, { method: "GET", headers, signal })

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`) as Error & { status: number }
      error.status = response.status
      throw error
    }

    const result: PageDataResponse = await response.json()

    // Strip server-side query errors ({ __error: "..." }) → null
    for (const key of Object.keys(result)) {
      const val = result[key]
      if (val && typeof val === "object" && "__error" in (val as Record<string, unknown>)) {
        result[key] = null
      }
    }

    return result
  })
}
