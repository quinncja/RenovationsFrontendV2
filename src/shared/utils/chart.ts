import { shortMonth } from "./format"

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

/**
 * Converts an array of monthly data points into a full 12-month series
 * suitable for Nivo line charts. Missing months are filled with null.
 */
export function buildMonthSeries<T extends { month: number }>(
  points: T[],
  valueKey: keyof T,
) {
  return ALL_MONTHS.map((m) => {
    const found = points.find((p) => p.month === m)
    return { x: shortMonth(m), y: found ? (found[valueKey] as number) : null }
  })
}
