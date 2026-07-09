import {
  fetchPageData,
  type FetchPageDataOptions,
  type ModuleName,
  type PageQueries,
  type PageParams,
  type PageDataResponse,
} from "./pageApi"

/**
 * Preload cache for fetchPageData results, fired during the daily-arrival
 * welcome screen so the destination page mounts onto already-fetched data.
 * Entries are consume-once: adoption removes them, so normal refetch
 * semantics resume immediately after the first mount.
 */

// Consumers must go stale eventually if never adopted (e.g. the user closes
// the welcome screen and navigates elsewhere for a while).
const TTL_MS = 5 * 60 * 1000

interface CacheEntry {
  promise: Promise<PageDataResponse>
  at: number
}

const cache = new Map<string, CacheEntry>()

// Must mirror PageDataProvider's queriesKey/paramsKey exactly (JSON.stringify
// of the same values, params defaulted to {}) or adoption will never match.
function cacheKey(module: ModuleName, queries: PageQueries, params?: PageParams): string {
  return `${module}|${JSON.stringify(queries)}|${JSON.stringify(params ?? {})}`
}

export function preloadPageData(options: FetchPageDataOptions): void {
  const key = cacheKey(options.module, options.queries, options.params)
  const existing = cache.get(key)
  if (existing && Date.now() - existing.at < TTL_MS) return

  const promise = fetchPageData(options)
  // A failed preload must never poison the page's own fetch — drop it so the
  // consumer falls through to a regular request.
  promise.catch(() => cache.delete(key))
  cache.set(key, { promise, at: Date.now() })
}

export function takePreloadedPageData(
  module: ModuleName,
  queries: PageQueries,
  params?: PageParams
): Promise<PageDataResponse> | null {
  const key = cacheKey(module, queries, params)
  const entry = cache.get(key)
  if (!entry) return null
  cache.delete(key)
  if (Date.now() - entry.at >= TTL_MS) return null
  return entry.promise
}
