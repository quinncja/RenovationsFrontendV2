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
}

export function usePageYear(): number {
  const { params } = usePageData()
  return typeof params.year === "number" ? params.year : new Date().getFullYear()
}

export function useWidgetData<T extends Record<string, unknown>>(
  queryNames: string[]
): WidgetDataResult<T> {
  const { data, isLoading } = usePageData()

  const widgetData = queryNames.reduce((acc, name) => {
    acc[name] = data[name] ?? null
    return acc
  }, {} as Record<string, unknown>) as T

  return { data: widgetData, isLoading }
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

  const value = useMemo<PageContextValue>(
    () => ({
      data,
      isLoading,
      error,
      params,
      refetch,
    }),
    [data, isLoading, error, params, refetch]
  )

  return <PageContext.Provider value={value}>{children}</PageContext.Provider>
}
