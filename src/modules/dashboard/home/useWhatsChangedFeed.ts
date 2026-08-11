import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useWidgetData } from "../../../shared/context/PageContext"
import { fetchPageData } from "../../../shared/api/pageApi"

// One event on the What's Changed timeline. `cost` = a batch of job cost
// lines posted on one calendar day for one job; `status` = the project was
// marked Complete (5) or Closed (6).
export interface WhatsChangedItem {
  kind: "cost" | "status"
  id: string
  jobId: string
  amount: number | null
  lineCount: number | null
  newStatus: number | null
  occurredAt: string
  jobName: string
  pmName: string | null
  marginAfter: number | null
  marginBefore: number | null
}

interface FeedPayload {
  scope: string
  offset: number
  limit: number
  hasMore: boolean
  items: WhatsChangedItem[]
}

export const WHATS_CHANGED_PAGE_SIZE = 10

export type WhatsChangedQuery = "whatsChangedPm" | "whatsChangedGm"

/**
 * Backing data for the What's Changed timeline. Page 0 rides the page
 * provider's fetch (the query is part of PAGE_QUERIES.managerHome /
 * generalManagerHome with the backend's default offset 0 / limit 10); later
 * pages are fetched ad hoc with an explicit offset as the user scrolls.
 * Null-tolerant by design: a backend that doesn't know the query yet, a
 * missing employeeId claim, or a SQL disconnect all resolve the query to null
 * and the feed simply reports `unavailable`.
 */
export function useWhatsChangedFeed(queryName: WhatsChangedQuery) {
  const { data, isLoading } = useWidgetData<Record<string, FeedPayload | null>>([queryName])
  const first = data?.[queryName] ?? null

  const [extra, setExtra] = useState<WhatsChangedItem[]>([])
  // null = no extra page fetched yet; follow the first page's hasMore.
  const [extraHasMore, setExtraHasMore] = useState<boolean | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  // Ref guard so a re-observing IntersectionObserver can't double-fire a page
  // while the previous request is still in flight.
  const inFlight = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  // Offset pagination over a live feed can shift while the user reads (a new
  // event lands between pages) — de-dupe appended pages by item id so a
  // shifted row never renders twice.
  const items = useMemo(() => {
    const base = first?.items ?? []
    const seen = new Set(base.map((i) => i.id))
    const merged = [...base]
    for (const item of extra) {
      if (!seen.has(item.id)) {
        seen.add(item.id)
        merged.push(item)
      }
    }
    return merged
  }, [first, extra])

  const hasMore = extraHasMore ?? first?.hasMore ?? false
  // Offset counts rows fetched (pre-dedupe), not rows rendered.
  const fetchedCount = (first?.items.length ?? 0) + extra.length

  const loadMore = useCallback(() => {
    if (inFlight.current || !hasMore || !first) return
    inFlight.current = true
    setLoadingMore(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    fetchPageData({
      module: "dashboard",
      queries: [queryName],
      params: { offset: fetchedCount, limit: WHATS_CHANGED_PAGE_SIZE },
      signal: ctrl.signal,
    })
      .then((d) => {
        const page = (d[queryName] as FeedPayload | null) ?? null
        if (!page) {
          // Query nulled server-side — stop asking rather than loop.
          setExtraHasMore(false)
          return
        }
        setExtra((prev) => [...prev, ...page.items])
        setExtraHasMore(page.hasMore)
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return
        setExtraHasMore(false)
      })
      .finally(() => {
        inFlight.current = false
        setLoadingMore(false)
      })
  }, [queryName, first, hasMore, fetchedCount])

  return {
    items,
    hasMore,
    loadMore,
    loadingMore,
    /** First page still loading (page provider). */
    isLoading,
    /** The query resolved to null — old backend, missing claim, or disconnect. */
    unavailable: !isLoading && first === null,
  }
}
