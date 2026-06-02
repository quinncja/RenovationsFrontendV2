import { StatWidget } from "../../../shared/components/StatWidget/StatWidget"
import { useWidgetData, usePageYear } from "../../../shared/context/PageContext"

// Year margin = (year revenue − year direct expenses) / year revenue, derived
// from annualRevenueTrend (selected year) and annualDirectExpenses.total — the
// same calculation the old frontend used for the year "Margin".
export function CurrentYearMarginWidget() {
  const year = usePageYear()
  const { data, isLoading } = useWidgetData<{
    annualRevenueTrend: { year: number; revenue: number }[] | null
    annualDirectExpenses: { total?: number } | null
  }>(["annualRevenueTrend", "annualDirectExpenses"])

  const revenue = Array.isArray(data?.annualRevenueTrend)
    ? data.annualRevenueTrend.find((d) => d.year === year)?.revenue ?? null
    : null
  const spent = data?.annualDirectExpenses?.total ?? null
  const margin =
    revenue != null && revenue !== 0 && spent != null
      ? ((revenue - spent) / revenue) * 100
      : null

  return <StatWidget title={`${year} Margin`} value={margin} format="percent" loading={isLoading} />
}
