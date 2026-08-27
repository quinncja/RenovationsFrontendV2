import { shortMonth } from "../../shared/utils/format"

/** One row of the `overheadCategoryHistory` query: net overhead for an
 *  account in one posting month (13 = year-end adjustments). */
export interface CategoryHistoryRow {
  account_number: number | string
  account_name: string
  parent_account?: number | string
  year: number
  month: number
  net: number
}

export interface TrendGroup {
  id: string
  accountId: string
  color: string
  match: (r: CategoryHistoryRow) => boolean
}

export interface TrendPoint {
  x: string
  /** Numeric key behind the label: month 1-12 or the year. */
  key: number
  y: number | null
}

export interface TrendSeries {
  id: string
  accountId: string
  color: string
  data: TrendPoint[]
  total: number
  /** Monthly view only: the whole prior year on the same twelve x's. */
  prevData: { x: string; y: number }[] | null
}

export interface TrendResult {
  series: TrendSeries[]
  grandTotal: number
  lastPosted: number
  /** Whole-period overhead per x label (every category, not just the drawn
   *  ones) so a tooltip's share stays "of the month/year". */
  sliceTotals: Record<string, number>
}

export type TrendView = "monthly" | "yearly"

/**
 * Category Trend series: per group, the selected year by month (unposted
 * months null so the axis still spans Jan-Dec) or every year, month-13
 * adjustments included so yearly totals reconcile with Annual Overhead.
 * Shared by the report's panel grid and the category detail modal so both
 * views draw the same numbers.
 */
export function buildCategoryTrend(
  raw: CategoryHistoryRow[],
  groups: TrendGroup[],
  view: TrendView,
  pageYear: number,
): TrendResult | null {
  if (raw.length === 0 || groups.length === 0) return null
  const monthly = view === "monthly"
  const postedMonths = raw
    .filter((r) => r.year === pageYear && r.month >= 1 && r.month <= 12)
    .map((r) => r.month)
  const lastPosted = postedMonths.length ? Math.max(...postedMonths) : 0
  const xs = monthly
    ? Array.from({ length: 12 }, (_, i) => ({ key: i + 1, label: shortMonth(i + 1), posted: i + 1 <= lastPosted }))
    : Array.from(new Set(raw.map((r) => r.year)))
        .sort((a, b) => a - b)
        .map((y) => ({ key: y, label: String(y), posted: true }))
  if (!xs.some((x) => x.posted)) return null
  const inScope = (r: CategoryHistoryRow, key: number) =>
    monthly ? r.year === pageYear && r.month === key : r.year === key
  const series: TrendSeries[] = groups.map((g) => {
    const points: TrendPoint[] = xs.map((x) => ({
      x: x.label,
      key: x.key,
      y: x.posted ? raw.filter((r) => g.match(r) && inScope(r, x.key)).reduce((s, r) => s + (r.net || 0), 0) : null,
    }))
    const prevData = monthly
      ? xs.map((x) => ({
          x: x.label,
          y: raw
            .filter((r) => g.match(r) && r.year === pageYear - 1 && r.month === x.key)
            .reduce((s, r) => s + (r.net || 0), 0),
        }))
      : null
    const hasPrev = prevData != null && raw.some((r) => g.match(r) && r.year === pageYear - 1)
    return {
      id: g.id,
      accountId: g.accountId,
      color: g.color,
      data: points,
      total: points.reduce((s, p) => s + (p.y ?? 0), 0),
      prevData: hasPrev ? prevData : null,
    }
  })
  const grandTotal = series.reduce((s, x) => s + Math.max(x.total, 0), 0)
  const sliceTotals: Record<string, number> = {}
  xs.forEach((x, i) => {
    if (x.posted) sliceTotals[x.label] = series.reduce((s, ser) => s + (ser.data[i].y ?? 0), 0)
  })
  return { series, grandTotal, lastPosted, sliceTotals }
}
