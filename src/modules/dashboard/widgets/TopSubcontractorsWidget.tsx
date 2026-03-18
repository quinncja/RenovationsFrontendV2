import { TopSpendWidget } from "./TopSpendWidget"

const SUBCONTRACTOR_COLORS = [
  "#7c2d12", "#c2410c", "#ea580c", "#f97316", "#fb923c",
]

export function TopSubcontractorsWidget() {
  return (
    <TopSpendWidget
      title="Top 5 Subcontractors by Spend"
      description="Based on AP invoices coded to subcontractors (GL 5200) in the selected year."
      queryKey="topSubcontractorsBySpend"
      totalQueryKey="totalSubcontractorSpend"
      listPath="/subcontractors"
      detailPath="/subcontractors"
      previewCount={5}
      colors={SUBCONTRACTOR_COLORS}
      centerLabel="TOTAL SPEND"
      chartSize="md"
    />
  )
}
