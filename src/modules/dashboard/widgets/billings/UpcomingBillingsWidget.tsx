import { useMemo } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { Widget } from "../../../../shared/components/Widget/Widget"
import { Chart } from "../../../../shared/components/Chart/Chart"
import { ChartLegend } from "../../../../shared/components/Chart/ChartLegend"
import { formatMoney } from "../../../../shared/utils/format"
import useIsMobile from "../../../../shared/hooks/useIsMobile"
import { AR_COLOR, AP_COLOR, useAgingForecast } from "./billingsShared"
import type { DashboardWidgetProps } from "../../config/widgetRegistry"

interface ForecastHistoryWeek {
  label: string
  ar: { actual: number | null }
  ap: { actual: number | null }
}

interface UpcomingBillingsWidgetProps extends DashboardWidgetProps {
  onWeekSelect?: (weekIndex: number) => void
  pastWeeks?: ForecastHistoryWeek[]
}

/**
 * Upcoming Billings forecast chart. Split out of the former
 * UpcomingBillingsWidget (the right card of the old `.billings-pair`) into a
 * standalone widget; keeps the `upcomingBillings` widget id. The "View" link
 * opens the per-invoice breakdown behind the chart.
 */
export function UpcomingBillingsWidget({ onWeekSelect, pastWeeks }: UpcomingBillingsWidgetProps = {}) {
  const { forecast, isLoading } = useAgingForecast()
  const navigate = useNavigate()

  // Diverging lines: AR rides above zero, AP (negated) below, so each week
  // still reads as money-in vs money-out at a glance — now as two trend lines.
  const chartWeeks = useMemo(
    () => [
      ...(pastWeeks ?? []).slice(-8).map((w) => ({ label: w.label, ar: w.ar.actual, ap: w.ap.actual })),
      ...(forecast?.weeks ?? []),
    ],
    [pastWeeks, forecast]
  )
  const series = useMemo(
    () => [
      { id: "AR", color: AR_COLOR, data: chartWeeks.map((w) => ({ x: w.label, y: w.ar })) },
      { id: "AP", color: AP_COLOR, data: chartWeeks.map((w) => ({ x: w.label, y: w.ap == null ? null : -w.ap })) },
    ],
    [chartWeeks]
  )

  // Thin mobile labels around Today, with more space when history is included.
  const isMobile = useIsMobile()
  const axisBottomTickValues = useMemo(
    () => {
      if (!isMobile) return undefined
      const todayIndex = chartWeeks.findIndex((w) => w.label === "This Week")
      const step = todayIndex > 0 ? 4 : 2
      return chartWeeks.filter((_, i) => (i - todayIndex) % step === 0).map((w) => w.label)
    },
    [isMobile, chartWeeks]
  )

  const viewLink = (
    <Link to="/dashboard/forecast-billings" className="widget-link-btn" title="View forecast billings invoices">
      View <ChevronRight size={12} />
    </Link>
  )

  return (
    <Widget title="Forecast Billings" loading={isLoading} noData={!forecast} actions={
      <>
        <ChartLegend items={[{ label: "AP", color: AP_COLOR }, { label: "AR", color: AR_COLOR }]} />
        <span className="ubf-key"><span className="ubf-key-line ubf-key-line--dashed" />Projected</span>
        {!onWeekSelect && viewLink}
      </>
    } className="billings-chart-card">
      {forecast && (
        <Chart
          config={{
            type: "line",
            series,
            // Read magnitudes outward from zero — both directions positive.
            yFormat: (v) => formatMoney(Math.abs(v)),
            enableArea: true,
            curve: "monotoneX",
            legend: false,
            hidePoints: true,
            dashedFromX: "This Week",
            tooltipSeriesLabel: (id, label) => {
              const isPast = pastWeeks?.some((week) => week.label === label)
              return `${id} ${isPast ? (id === "AR" ? "Received" : "Paid") : "Projected"}`
            },
            axisBottomTickValues,
            shadeFromX: pastWeeks?.length ? "This Week" : undefined,
            markers: [
              {
                axis: "x",
                value: "This Week",
                legend: "Today",
                legendPosition: "top",
                lineStyle: { stroke: "currentColor", strokeWidth: 1, strokeOpacity: 0.35, strokeDasharray: "3 4" },
                textStyle: { fill: "currentColor", fontSize: 10, fontWeight: 600 },
              },
            ],
            // AR vs AP aren't a period-over-period comparison, so suppress the
            // multi-series "growth" row in the slice tooltip.
            disableGrowthTooltip: true,
            netTooltip: true,
            // Click a point → open the breakdown page at that week's card.
            onPointClick: (label) => {
              const i = forecast?.weeks.findIndex((w) => w.label === label) ?? -1
              if (i < 0) return
              if (onWeekSelect) {
                if (i >= 0) onWeekSelect(i)
                return
              }
              const params = new URLSearchParams()
              if (i >= 0) params.set("week", String(i))
              const qs = params.toString()
              navigate(`/dashboard/forecast-billings${qs ? `?${qs}` : ""}`)
            },
          }}
        />
      )}
    </Widget>
  )
}
