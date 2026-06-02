import { useState } from "react"

export type SortDir = "asc" | "desc"

export interface TableSort<K extends string> {
  key: K | null
  dir: SortDir | null
  /** Cycle a column: inactive → desc → asc → unsorted (third click resets). */
  toggle: (key: K) => void
}

/**
 * Shared three-state sort used by every in-widget table so the controls behave
 * identically: first click sorts descending, second ascending, third resets to
 * the data's natural order.
 */
export function useTableSort<K extends string>(
  defaultKey: K | null = null,
  defaultDir: SortDir | null = null
): TableSort<K> {
  const [key, setKey] = useState<K | null>(defaultKey)
  const [dir, setDir] = useState<SortDir | null>(defaultDir)

  function toggle(next: K) {
    if (key !== next) {
      setKey(next)
      setDir("desc")
    } else if (dir === "desc") {
      setDir("asc")
    } else {
      // was "asc" (or null) → third click clears the sort
      setKey(null)
      setDir(null)
    }
  }

  return { key, dir, toggle }
}

type SortValue = number | string | null | undefined

/** Returns rows sorted per `sort`, or the original array when unsorted. */
export function applySort<T, K extends string>(
  rows: T[],
  sort: TableSort<K>,
  accessor: (row: T, key: K) => SortValue
): T[] {
  if (!sort.key || !sort.dir) return rows
  const key = sort.key
  const dir = sort.dir
  return [...rows].sort((a, b) => {
    const av = accessor(a, key)
    const bv = accessor(b, key)
    if (typeof av === "number" && typeof bv === "number") {
      return dir === "asc" ? av - bv : bv - av
    }
    return dir === "asc"
      ? String(av ?? "").localeCompare(String(bv ?? ""))
      : String(bv ?? "").localeCompare(String(av ?? ""))
  })
}
