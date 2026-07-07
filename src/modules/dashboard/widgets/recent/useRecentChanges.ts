import { useMemo } from "react"
import { useWidgetData } from "../../../../shared/context/PageContext"
import { sinceLabel } from "../../../../shared/utils/format"
import type { RecentChangeItem, RecentChangesPayload } from "./recentTypes"

/** Which query feeds the cards: the admin home fetches recentChangesAdmin
 *  (company-wide + billing), the manager home fetches recentChangesPm
 *  (token-scoped to their jobs). */
export type RecentSource = "admin" | "pm"

export interface RecentChangesData {
  items: RecentChangeItem[]
  /** Human label for the window start — "yesterday", or "Friday" on a Monday. */
  sinceLabel: string
  isLoading: boolean
  disconnected: boolean
}

/**
 * Shared accessor for the Recent Changes cards. Both audiences receive one
 * flat item list sorted newest-first by the backend; each card filters it by
 * kind, so every card on a page reads the same fetch.
 */
export function useRecentChanges(source: RecentSource): RecentChangesData {
  const queryName = source === "admin" ? "recentChangesAdmin" : "recentChangesPm"
  const { data, isLoading, disconnected } = useWidgetData<
    Record<string, RecentChangesPayload | null>
  >([queryName])
  const payload = data?.[queryName] ?? null

  return useMemo(() => {
    const items = Array.isArray(payload?.items) ? payload.items : []
    return {
      items,
      sinceLabel: payload?.cutoff ? sinceLabel(payload.cutoff) : "yesterday",
      isLoading,
      disconnected,
    }
  }, [payload, isLoading, disconnected])
}
