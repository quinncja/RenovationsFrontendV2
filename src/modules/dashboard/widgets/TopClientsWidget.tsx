import { useDashboardLayout } from "../context/DashboardLayoutContext"
import { TopSpendWidget } from "./TopSpendWidget"
import { CLIENT_COLORS_5, CLIENT_COLORS_10 } from "../../../shared/config/chartColors"

export function TopClientsWidget() {
  const { layout } = useDashboardLayout()
  const colSpan = layout.widgets.find((w) => w.id === "topClients")?.colSpan ?? 2
  const isFullWidth = colSpan === 2
  const count = isFullWidth ? 10 : 5

  return (
    <TopSpendWidget
      title={`Top ${count} Clients by Revenue`}
      description="Ranked by AR invoices posted in the selected year"
      queryKey="topClientsByRevenue"
      totalQueryKey="yearRevenue"
      listPath="/clients"
      detailPath="/clients"
      previewCount={count}
      colors={isFullWidth ? CLIENT_COLORS_10 : CLIENT_COLORS_5}
      centerLabel="TOTAL REVENUE"
      chartSize={isFullWidth ? "lg" : "md"}
    />
  )
}
