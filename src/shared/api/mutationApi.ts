import { auth } from "../../core/auth/firebase"
import { sessionTrackingHeaders } from "../analytics/analytics"

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/"
const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true'

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (DEV_BYPASS) {
    return { "Content-Type": "application/json", ...sessionTrackingHeaders() }
  }
  const token = await auth.currentUser?.getIdToken()
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...sessionTrackingHeaders(),
  }
}

export async function apiRequest<T = unknown>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (!response.ok) {
    const error = new Error(await readErrorMessage(response)) as Error & { status: number }
    error.status = response.status
    throw error
  }

  const text = await response.text()
  return text ? JSON.parse(text) : ({} as T)
}

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `HTTP ${response.status}`
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown }
    const parts = [body.error, body.message].filter(
      (part): part is string => typeof part === "string" && part.trim() !== ""
    )
    return parts.length > 0 ? `${parts.join(": ")} (${fallback})` : fallback
  } catch {
    return fallback
  }
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers,
  })

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`) as Error & { status: number }
    error.status = response.status
    throw error
  }

  return response.json()
}

// ─── Change Orders ───────────────────────────────────────────────

export interface ChangeOrderData {
  name: string
  total: number
  material: number
  labor: number
  subs: number
  wtpm: number
  lineItems: ChangeOrderLineItem[]
  /** One row per non-zero cost type per line item — what the backend inserts. */
  rowObjects: ChangeOrderRowObject[]
  jobString: string
  recnum: string
  user: string
}

export interface ChangeOrderLineItem {
  desc: string
  unit: string
  material: number
  labor: number
  subs: number
  wtpm: number
  total: number
}

export type ChangeOrderCostType = "material" | "labor" | "subs" | "wtpm"

export interface ChangeOrderRowObject {
  desc: string
  unit: string
  type: ChangeOrderCostType
  price: number
}

export function createChangeOrder(data: ChangeOrderData) {
  return apiRequest("change-orders", "POST", data)
}

export function deleteChangeOrder(recnum: string) {
  return apiRequest(`change-orders/${recnum}`, "DELETE")
}

// ─── Feedback ────────────────────────────────────────────────────

export interface FeedbackData {
  type: "Bug" | "Suggestion"
  message: string
  user: string
}

export function submitFeedback(data: FeedbackData) {
  return apiRequest("feedback", "POST", data)
}

export function deleteFeedback(id: string) {
  return apiRequest(`feedback/${id}`, "DELETE")
}

// ─── Users ───────────────────────────────────────────────────────

export function changeUserRole(userId: string, role: string) {
  return apiRequest("user-role", "POST", { userId, role })
}

/**
 * A manager self-selects which supervisor (SAGE employee) they are. The backend
 * validates the id against the live supervisor list and ties it to the user's
 * account as an `employeeId` custom claim. The caller must then force-refresh
 * the ID token (`getIdToken(true)`) to pick up the new claim.
 */
export function selectSupervisor(employeeId: number) {
  return apiRequest("user/select-supervisor", "POST", { employeeId })
}

export function getUserActivity(userId: string, timezone?: string) {
  const params = timezone ? `?timezone=${encodeURIComponent(timezone)}` : ""
  return apiGet(`user-activity/${userId}${params}`)
}

export function getMonthlyStats(userId: string, year: number, month: number) {
  return apiGet(`user-activity/${userId}/month?year=${year}&month=${month}`)
}
