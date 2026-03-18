import { TopSpendWidget } from "./TopSpendWidget"

const CLIENT_COLORS = [
  "#1e3a8a", "#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa",
  "#93c5fd", "#bfdbfe", "#dbeafe", "#bae6fd", "#e0f2fe",
]

export function TopClientsWidget() {
  return (
    <TopSpendWidget
      title="Top 10 Clients by Revenue"
      description="Ranked by AR invoices posted in the selected year"
      queryKey="topClientsByRevenue"
      totalQueryKey="yearRevenue"
      listPath="/clients"
      detailPath="/clients"
      previewCount={10}
      colors={CLIENT_COLORS}
      centerLabel="TOTAL REVENUE"
      chartSize="lg"
    />
  )
}
