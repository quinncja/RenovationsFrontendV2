import useLocalStorage from "../../shared/hooks/useLocalStorage"
import type { SortDir } from "../../shared/components/SortTh"
import { computeRow } from "./calc"
import type { ProjectionRow } from "./types"

/* ── Column sort (per-viewer, remembered in localStorage) ──────────────────
 * Same cycle as the Jobcost project table: text columns start ascending,
 * numeric columns descending, second click flips, third click clears back
 * to the sheet's own (drag-arranged) order. */

/** Row input keys, computed keys, or `month:0`..`month:11`. */
export type ProjectionSortKey = string

const TEXT_KEYS = new Set(["address", "client", "name"])

interface StoredSort {
  key: ProjectionSortKey | null
  dir: SortDir
}

export function useProjectionSort(table: "grid" | "pipeline") {
  const [sort, setSort] = useLocalStorage<StoredSort>(`pj-sort:${table}`, { key: null, dir: "asc" })
  const onSort = (key: ProjectionSortKey) => {
    const defaultDir: SortDir = TEXT_KEYS.has(key) ? "asc" : "desc"
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: defaultDir }
      if (prev.dir === defaultDir) return { key, dir: defaultDir === "asc" ? "desc" : "asc" }
      return { key: null, dir: "asc" }
    })
  }
  /** Back to the sheet's own order (a drag under a sort adopts the sorted
   *  order as the new sheet order, then calls this). */
  const clearSort = () => setSort({ key: null, dir: "asc" })
  return { sortKey: sort.key, sortDir: sort.dir, onSort, clearSort, sorted: sort.key != null }
}

function sortValue(row: ProjectionRow, key: ProjectionSortKey): string | number {
  if (TEXT_KEYS.has(key)) return String(row[key as "address"] ?? "")
  if (key.startsWith("month:")) return row.months[Number(key.slice(6))] ?? 0
  if (key in row) return Number(row[key as "units"]) || 0
  const c = computeRow(row)
  return key in c ? c[key as keyof typeof c] : 0
}

/** Rows in display order: the sheet's sortOrder when unsorted, else the
 *  chosen column (ties fall back to sheet order so the sort is stable). */
export function orderRows(rows: ProjectionRow[], key: ProjectionSortKey | null, dir: SortDir): ProjectionRow[] {
  if (!key) return rows
  const sign = dir === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key)
    const bv = sortValue(b, key)
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" })
    return cmp !== 0 ? cmp * sign : a.sortOrder - b.sortOrder
  })
}

/** The pinned compact header is a DOM clone of the live label row (no React
 *  handlers). Route a click on one of its cells to the matching live header
 *  button so sorting works from the strip too. */
export function pinHeaderClick(scrollEl: HTMLElement | null, target: EventTarget | null) {
  const th = (target as HTMLElement | null)?.closest("th")
  if (!th || !th.parentElement || !scrollEl) return
  const i = Array.from(th.parentElement.children).indexOf(th)
  const live =
    scrollEl.querySelector<HTMLTableRowElement>("thead tr:nth-child(2)") ??
    scrollEl.querySelector<HTMLTableRowElement>("thead tr")
  live?.cells[i]?.querySelector("button")?.click()
}

/** The pinned strip's Address slot is a clone of the live lead label cell;
 *  forward its click to that cell's sort button. */
export function pinAddrClick(scrollEl: HTMLElement | null) {
  const live =
    scrollEl?.querySelector<HTMLTableRowElement>("thead tr:nth-child(2)") ??
    scrollEl?.querySelector<HTMLTableRowElement>("thead tr")
  live?.cells[0]?.querySelector("button")?.click()
}
