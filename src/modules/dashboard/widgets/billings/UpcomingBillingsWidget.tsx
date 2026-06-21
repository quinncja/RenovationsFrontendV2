import { useMemo } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { Widget } from "../../../../shared/components/Widget/Widget"
import { Chart } from "../../../../shared/components/Chart/Chart"
import { formatMoney } from "../../../../shared/utils/format"
import useIsMobile from "../../../../shared/hooks/useIsMobile"
import { AR_COLOR, AP_COLOR, useAgingForecast } from "./billingsShared"

/**
 * Upcoming Billings forecast chart. Split out of the former
 * UpcomingBillingsWidget (the right card of the old `.billings-pair`) into a
 * standalone widget; keeps the `upcomingBillings` widget id. The "View" link
 * opens the per-invoice breakdown behind the chart.
 */
export function UpcomingBillingsWidget() {
  const { forecast, isLoading } = useAgingForecast()
  const navigate = useNavigate()

  // Diverging lines: AR rides above zero, AP (negated) below, so each week
  // still reads as money-in vs money-out at a glance — now as two trend lines.
  const series = useMemo(
    () => [
      { id: "AR", color: AR_COLOR, data: forecast?.weeks.map((w) => ({ x: w.label, y: w.ar })) ?? [] },
      { id: "AP", color: AP_COLOR, data: forecast?.weeks.map((w) => ({ x: w.label, y: -w.ap })) ?? [] },
    ],
    [forecast]
  )

  // Mobile: nine bucket labels crowd the x axis — show every other one
  // ("This Week", Week 3, Week 5, Week 7, "Later").
  const isMobile = useIsMobile()
  const axisBottomTickValues = useMemo(
    () => (isMobile ? forecast?.weeks.filter((_, i) => i % 2 === 0).map((w) => w.label) : undefined),
    [isMobile, forecast]
  )

  const viewLink = (
    <Link to="/dashboard/upcoming-billings" className="widget-link-btn" title="View upcoming billings invoices">
      View <ChevronRight size={12} />
    </Link>
  )

  return (
    <Widget title="Upcoming Billings" loading={isLoading} noData={!forecast} actions={viewLink} className="billings-chart-card">
      {forecast && (
        <Chart
          config={{
            type: "line",
            series,
            // Read magnitudes outward from zero — both directions positive.
            yFormat: (v) => formatMoney(Math.abs(v)),
            enableArea: true,
            curve: "monotoneX",
            legend: true,
            axisBottomTickValues,
            // AR vs AP aren't a period-over-period comparison, so suppress the
            // multi-series "growth" row in the slice tooltip.
            disableGrowthTooltip: true,
            // Click a point → open the breakdown page at that week's card.
            onPointClick: (label) => {
              const i = forecast?.weeks.findIndex((w) => w.label === label) ?? -1
              const params = new URLSearchParams()
              if (i >= 0) params.set("week", String(i))
              const qs = params.toString()
              navigate(`/dashboard/upcoming-billings${qs ? `?${qs}` : ""}`)
            },
          }}
        />
      )}
    </Widget>
  )
}
