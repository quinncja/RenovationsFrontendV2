import { useMemo } from "react"
import { Widget } from "../../../shared/components/Widget/Widget"
import { Chart } from "../../../shared/components/Chart/Chart"
import { MotionItem } from "../../../shared/components/MotionList/MotionList"
import { formatPercent, shortMonth } from "../../../shared/utils/format"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import useIsMobile from "../../../shared/hooks/useIsMobile"
import { marginColor, type Breakdown } from "./breakdownRows"
import { computeSymlogBars } from "./symlogBars"

/**
 * The four per-employee performance charts (monthly/yearly Work Completed +
 * Margin) as MotionItems — must be rendered inside a MotionList grid. Shared
 * between the admin /employees/:id view and the PM home's Performance Over
 * Time section so the charts can never drift apart.
 */
export function PerformanceCharts({
  monthly,
  yearly,
  year,
  isLoading,
}: {
  monthly: Breakdown["stats"]["monthly"] | undefined
  yearly: Breakdown["stats"]["yearly"] | undefined
  year: number
  isLoading: boolean
}) {
  const marginColorsOn = useMarginColorsEnabled()
  // On mobile match the WIP toggle's label rather than spelling out "Work
  // Completed" (keeps the chart titles/legends short and consistent).
  const isMobile = useIsMobile()
  const wcLabel = isMobile ? "WIP" : "Work Completed"

  // Line chart: Work Completed (income) by year. Mirrors AnnualRevenueWidget's
  // line series shape — one series, x = year as string, y = income.
  const workCompletedSeries = useMemo(() => {
    if (!yearly || yearly.length === 0) return null
    const sorted = [...yearly].sort((a, b) => a.year - b.year)
    return [{
      id: wcLabel,
      data: sorted.map((d) => ({ x: String(d.year), y: d.income })),
    }]
  }, [yearly, wcLabel])

  // breakdown.stats.monthly is already filtered to the selected year on the
  // backend; sort + project into the chart shapes, filling missing months with
  // 0 so the x-axis always reads Jan→Dec.
  const monthlyWorkCompletedSeries = useMemo(() => {
    if (!monthly || monthly.length === 0) return null
    const byMonth = new Map<number, number>()
    for (const d of monthly) {
      if (d.month >= 1 && d.month <= 12) byMonth.set(d.month, d.income)
    }
    return [
      {
        id: wcLabel,
        data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => ({
          x: shortMonth(m),
          y: byMonth.get(m) ?? 0,
        })),
      },
    ]
  }, [monthly, wcLabel])

  const monthlyMarginBars = useMemo(() => {
    if (!monthly || monthly.length === 0) return null
    const byMonth = new Map<number, number>()
    for (const d of monthly) {
      if (d.month >= 1 && d.month <= 12) byMonth.set(d.month, d.margin)
    }
    return computeSymlogBars(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => ({
        label: shortMonth(m),
        value: byMonth.get(m) ?? 0,
      }))
    )
  }, [monthly])

  const marginBars = useMemo(() => {
    if (!yearly || yearly.length === 0) return null
    const sorted = [...yearly].sort((a, b) => a.year - b.year)
    return computeSymlogBars(sorted.map((d) => ({ label: String(d.year), value: d.margin })))
  }, [yearly])

  const marginBarConfig = (bars: NonNullable<typeof marginBars>) =>
    ({
      type: "bar",
      data: bars.bars,
      yFormat: formatPercent,
      colorBy: marginColorsOn ? marginColor : undefined,
      barGradient: true,
      scaleType: "symlog",
      scaleConstant: bars.scaleConstant,
      minValue: bars.minValue,
      maxValue: bars.maxValue,
      axisLeftTickValues: bars.ticks,
      emphasizeZero: true,
      // Full-height column hover (same as the admin home's margin chart) so
      // near-zero months are as hoverable as tall bars.
      barTooltip: (label: string, value: number) => (
        <div className="chart-tooltip">
          <span>{label}</span>
          <strong>{formatPercent(value)}</strong>
        </div>
      ),
    }) as const

  return (
    <>
      <MotionItem>
        <Widget title={`Monthly ${wcLabel} — ${year}`} loading={isLoading} noData={!monthlyWorkCompletedSeries}>
          {monthlyWorkCompletedSeries && (
            <Chart config={{ type: "line", series: monthlyWorkCompletedSeries, enableArea: true }} />
          )}
        </Widget>
      </MotionItem>

      <MotionItem>
        <Widget title={`Monthly Margin — ${year}`} loading={isLoading} noData={!monthlyMarginBars}>
          {monthlyMarginBars && <Chart config={marginBarConfig(monthlyMarginBars)} />}
        </Widget>
      </MotionItem>

      <MotionItem>
        <Widget title={`Yearly ${wcLabel}`} loading={isLoading} noData={!workCompletedSeries}>
          {workCompletedSeries && (
            <Chart config={{ type: "line", series: workCompletedSeries, enableArea: true }} />
          )}
        </Widget>
      </MotionItem>

      <MotionItem>
        <Widget title="Yearly Margin" loading={isLoading} noData={!marginBars}>
          {marginBars && <Chart config={marginBarConfig(marginBars)} />}
        </Widget>
      </MotionItem>
    </>
  )
}
