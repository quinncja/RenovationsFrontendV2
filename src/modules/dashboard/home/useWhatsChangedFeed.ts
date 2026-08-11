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
  /** Sage actr_u.parent — the shared-address property key the timeline groups
   *  cards by. Null/absent (one-off, missing actr_u row, or a backend that
   *  predates the column) leaves the job as its own single-member group. */
  parent?: string | null
  /** One-off display name (actr_u.oofnme); null for phases and unnamed one-offs. */
  oneoffName?: string | null
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

/** The timeline's filter toggle: both event kinds, or just one. */
export type WhatsChangedKind = "all" | "cost" | "status"

// A filtered kind owns its whole feed (page 0 included — the page provider
// only carries the unfiltered default). Cached per kind for the session so
// flipping the toggle back never refetches or re-skeletons.
interface FilteredFeed {
  items: WhatsChangedItem[]
  /** Rows fetched pre-dedupe — the next page's offset. */
  fetchedCount: number
  hasMore: boolean
  unavailable: boolean
}

// Offset pagination over a live feed can shift while the user reads (a new
// event lands between pages) — de-dupe appended pages by item id so a
// shifted row never renders twice.
function appendDeduped(base: WhatsChangedItem[], page: WhatsChangedItem[]): WhatsChangedItem[] {
  const seen = new Set(base.map((i) => i.id))
  const merged = [...base]
  for (const item of page) {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      merged.push(item)
    }
  }
  return merged
}

/**
 * Backing data for the What's Changed timeline. The unfiltered feed's page 0
 * rides the page provider's fetch (the query is part of
 * PAGE_QUERIES.managerHome / generalManagerHome with the backend's default
 * offset 0 / limit 10); later pages — and every page of a filtered kind —
 * are fetched ad hoc with an explicit offset (+ kind) as the user scrolls.
 * Null-tolerant by design: a backend that doesn't know the query yet, a
 * missing employeeId claim, or a SQL disconnect all resolve the query to null
 * and the feed simply reports `unavailable`.
 */
export function useWhatsChangedFeed(queryName: WhatsChangedQuery, kind: WhatsChangedKind = "all") {
  const { data, isLoading: firstLoading } = useWidgetData<Record<string, FeedPayload | null>>([queryName])
  const first = data?.[queryName] ?? null

  // Pages appended past the provider's page 0 (unfiltered feed only).
  const [extra, setExtra] = useState<WhatsChangedItem[]>([])
  // null = no extra page fetched yet; follow the first page's hasMore.
  const [extraHasMore, setExtraHasMore] = useState<boolean | null>(null)
  // Session cache of the filtered feeds, keyed by kind.
  const [filtered, setFiltered] = useState<Partial<Record<"cost" | "status", FilteredFeed>>>({})
  const [loadingMore, setLoadingMore] = useState(false)
  // Ref guard so a re-observing IntersectionObserver can't double-fire a page
  // while the previous request is still in flight.
  const inFlight = useRef(false)
  // Kinds whose page 0 has been requested — a ref, not inFlight, so a toggle
  // flip racing a scroll prefetch is neither skipped nor double-fetched.
  const requestedKinds = useRef(new Set<string>())
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const fetchPage = useCallback(
    (forKind: WhatsChangedKind, offset: number, onPage: (page: FeedPayload | null) => void) => {
      inFlight.current = true
      const ctrl = new AbortController()
      abortRef.current = ctrl
      fetchPageData({
        module: "dashboard",
        queries: [queryName],
        params: {
          offset,
          limit: WHATS_CHANGED_PAGE_SIZE,
          // Only a real filter travels — the unfiltered feed keeps the exact
          // request shape older backends already answer.
          ...(forKind !== "all" && { kind: forKind }),
        },
        signal: ctrl.signal,
      })
        .then((d) => onPage((d[queryName] as FeedPayload | null) ?? null))
        .catch((err) => {
          if (err instanceof Error && err.name === "AbortError") return
          onPage(null)
        })
        .finally(() => {
          inFlight.current = false
          setLoadingMore(false)
        })
    },
    [queryName]
  )

  // Page 0 of a filtered kind, fetched the first time the toggle lands on it.
  useEffect(() => {
    if (kind === "all" || filtered[kind] || requestedKinds.current.has(kind)) return
    requestedKinds.current.add(kind)
    fetchPage(kind, 0, (page) => {
      setFiltered((prev) => ({
        ...prev,
        [kind]: page
          ? { items: page.items, fetchedCount: page.items.length, hasMore: page.hasMore, unavailable: false }
          : { items: [], fetchedCount: 0, hasMore: false, unavailable: true },
      }))
    })
  }, [kind, filtered, fetchPage])

  const allItems = useMemo(() => appendDeduped(first?.items ?? [], extra), [first, extra])

  const current = kind === "all" ? null : (filtered[kind] ?? null)
  // Belt-and-braces client filter: a backend that predates the kind param
  // answers a filtered request with both kinds — drop the strays rather than
  // render a mislabeled feed.
  const items = useMemo(
    () => (kind === "all" ? allItems : (current?.items ?? []).filter((i) => i.kind === kind)),
    [kind, allItems, current]
  )

  const hasMore = kind === "all" ? (extraHasMore ?? first?.hasMore ?? false) : (current?.hasMore ?? false)
  // Offset counts rows fetched (pre-dedupe), not rows rendered.
  const fetchedCount =
    kind === "all" ? (first?.items.length ?? 0) + extra.length : (current?.fetchedCount ?? 0)

  const loadMore = useCallback(() => {
    if (inFlight.current || !hasMore) return
    if (kind === "all" && !first) return
    if (kind !== "all" && !current) return
    setLoadingMore(true)
    fetchPage(kind, fetchedCount, (page) => {
      if (kind === "all") {
        if (!page) {
          // Query nulled server-side — stop asking rather than loop.
          setExtraHasMore(false)
          return
        }
        setExtra((prev) => [...prev, ...page.items])
        setExtraHasMore(page.hasMore)
        return
      }
      setFiltered((prev) => {
        const f = prev[kind]
        if (!f) return prev
        return {
          ...prev,
          [kind]: page
            ? {
                items: appendDeduped(f.items, page.items),
                fetchedCount: f.fetchedCount + page.items.length,
                hasMore: page.hasMore,
                unavailable: false,
              }
            : { ...f, hasMore: false },
        }
      })
    })
  }, [kind, first, current, hasMore, fetchedCount, fetchPage])

  const isLoading = kind === "all" ? firstLoading : current === null

  return {
    items,
    hasMore,
    loadMore,
    loadingMore,
    /** First page of the current kind still loading. */
    isLoading,
    /** The query resolved to null — old backend, missing claim, or disconnect. */
    unavailable: kind === "all" ? !firstLoading && first === null : (current?.unavailable ?? false),
  }
}
