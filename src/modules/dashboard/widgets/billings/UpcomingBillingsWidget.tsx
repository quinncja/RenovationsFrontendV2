import { useMemo } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { Widget } from "../../../../shared/components/Widget/Widget"
import { Chart } from "../../../../shared/components/Chart/Chart"
import { formatMoney } from "../../../../shared/utils/format"
import { AR_COLOR, AP_COLOR, niceCeil, useAgingForecast } from "./billingsShared"

/**
 * Upcoming Billings forecast chart. Split out of the former
 * UpcomingBillingsWidget (the right card of the old `.billings-pair`) into a
 * standalone widget; keeps the `upcomingBillings` widget id. The "View" link
 * opens the per-invoice breakdown behind the chart.
 */
export function UpcomingBillingsWidget() {
  const { forecast, isLoading } = useAgingForecast()
  const navigate = useNavigate()

  // Diverging stacked bars: AR stacks up from zero, AP (negated) stacks down,
  // so each week reads as money-in vs money-out at a glance.
  const bars = useMemo(
    () =>
      forecast?.weeks.map((w) => ({
        label: w.label,
        AR: w.ar,
        AP: -w.ap,
      })) ?? [],
    [forecast]
  )

  // Symmetric y-bound = next nice step above the largest single AR-or-AP
  // magnitude. Equal ± range keeps the zero baseline vertically centered;
  // a sensible floor avoids a degenerate axis when everything is zero.
  const bound = useMemo(() => {
    const magnitude = Math.max(0, ...(forecast?.weeks.flatMap((w) => [w.ar, w.ap]) ?? []))
    return niceCeil(magnitude) || 10_000
  }, [forecast])

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
            type: "bar",
            data: bars,
            keys: ["AR", "AP"],
            indexBy: "label",
            colors: [AR_COLOR, AP_COLOR],
            // Read magnitudes outward from zero — both directions positive.
            yFormat: (v) => formatMoney(Math.abs(v)),
            minValue: -bound,
            maxValue: bound,
            // A small tick count keeps the axis clean; symmetric bounds put 0
            // in the middle with equal ticks above and below.
            axisLeftTickValues: 5,
            emphasizeZero: true,
            // One combined tooltip per week: AR, AP, and their net difference.
            groupTooltip: true,
            tooltipTotalLabel: "Net",
            hideLegend: true,
            // Click a bar → open the breakdown page at that week's AR/AP folder.
            onBarClick: (label, side) => {
              const i = forecast?.weeks.findIndex((w) => w.label === label) ?? -1
              const params = new URLSearchParams()
              if (i >= 0) params.set("week", String(i))
              if (side === "AR" || side === "AP") params.set("side", side)
              const qs = params.toString()
              navigate(`/dashboard/upcoming-billings${qs ? `?${qs}` : ""}`)
            },
          }}
        />
      )}
    </Widget>
  )
}
