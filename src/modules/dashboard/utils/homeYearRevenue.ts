export interface OpenYearRevenue {
  openMonthYear?: number
  openMonthIncome?: number
  openMonthOverUnder?: number
}

/** Shared by the homepage and Margin Report: closed-period GL + open income + optional company WIP. */
export function homeYearRevenue(
  year: number,
  annual: { year: number; revenue: number }[] | null | undefined,
  open: OpenYearRevenue | null | undefined,
  includeWip: boolean,
): number | null {
  if (!Array.isArray(annual) || !open) return null
  const closed = annual.find(row => row.year === year)?.revenue ?? null
  return open.openMonthYear === year
    ? (closed ?? 0) + (open.openMonthIncome ?? 0) + (includeWip ? open.openMonthOverUnder ?? 0 : 0)
    : closed
}
