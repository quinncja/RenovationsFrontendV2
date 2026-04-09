/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react"
import {
  fetchPageData,
  type ModuleName,
  type PageQueries,
  type PageParams,
  type PageDataResponse,
} from "../api/pageApi"

interface PageContextValue {
  data: PageDataResponse
  isLoading: boolean
  error: Error | null
  disconnected: boolean
  params: PageParams
  refetch: () => void
}

const PageContext = createContext<PageContextValue | null>(null)

export function usePageData(): PageContextValue {
  const context = useContext(PageContext)
  if (!context) {
    throw new Error("usePageData must be used within a PageDataProvider")
  }
  return context
}

interface WidgetDataResult<T = unknown> {
  data: T | null
  isLoading: boolean
  disconnected: boolean
}

/** Returns true if the data source is offline. Safe to call outside PageDataProvider. */
export function usePageDisconnected(): boolean {
  const context = useContext(PageContext)
  return context?.disconnected ?? false
}

export function usePageYear(): number {
  const { params } = usePageData()
  return typeof params.year === "number" ? params.year : new Date().getFullYear()
}

/** Returns a display label for the current period, e.g. "2026", "Q1 2026", or "All Time". */
export function usePeriodLabel(): string {
  const { params } = usePageData()
  const year = typeof params.year === "number" ? params.year : null
  if (year === null) return "All Time"
  const sm = typeof params.startMonth === "number" ? params.startMonth : null
  if (sm === 1) return `Q1 ${year}`
  if (sm === 4) return `Q2 ${year}`
  if (sm === 7) return `Q3 ${year}`
  if (sm === 10) return `Q4 ${year}`
  return String(year)
}

export function useWidgetData<T extends Record<string, unknown>>(
  queryNames: string[]
): WidgetDataResult<T> {
  const { data, isLoading } = usePageData()

  // If all requested queries returned null, the data source is likely offline
  let allNull = !isLoading && queryNames.length > 0

  const widgetData = queryNames.reduce((acc, name) => {
    const value = data[name] ?? null
    if (value !== null) allNull = false
    acc[name] = value
    return acc
  }, {} as Record<string, unknown>) as T

  return { data: widgetData, isLoading, disconnected: allNull }
}

interface PageDataProviderProps {
  module: ModuleName
  queries: PageQueries
  params?: PageParams
  children: ReactNode
}

export function PageDataProvider({
  module,
  queries,
  params = {},
  children,
}: PageDataProviderProps) {
  const [data, setData] = useState<PageDataResponse>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [fetchKey, setFetchKey] = useState(0)

  // Stable keys for dependency tracking
  const paramsKey = JSON.stringify(params)
  const queriesKey = JSON.stringify(queries)

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function loadData() {
      setIsLoading(true)
      setError(null)

      try {
        const result = await fetchPageData({
          module,
          queries,
          params,
          signal: controller.signal,
        })
        setData(result)
        setIsLoading(false)
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return
        }
        setError(err instanceof Error ? err : new Error("Unknown error"))
        setData({})
        setIsLoading(false)
      }
    }

    loadData()

    return () => controller.abort()
    // queriesKey and paramsKey are serialized proxies for queries and params —
    // using them directly avoids reference-equality misses on arrays/objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, queriesKey, paramsKey, fetchKey])

  // Data source is offline if we finished loading and every query result is null
  const disconnected = !isLoading && queries.length > 0 &&
    Object.keys(data).length > 0 &&
    Object.values(data).every((v) => v === null)

  const value = useMemo<PageContextValue>(
    () => ({
      data,
      isLoading,
      error,
      disconnected,
      params,
      refetch,
    }),
    [data, isLoading, error, disconnected, params, refetch]
  )

  return <PageContext.Provider value={value}>{children}</PageContext.Provider>
}
