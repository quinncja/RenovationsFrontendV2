import { useDashboardLayout } from "../context/DashboardLayoutContext"
import { TopSpendWidget } from "./TopSpendWidget"
import { SUBCONTRACTOR_COLORS_5, SUBCONTRACTOR_COLORS_10 } from "../../../shared/config/chartColors"

export function TopSubcontractorsWidget() {
  const { layout } = useDashboardLayout()
  const colSpan = layout.widgets.find((w) => w.id === "topSubcontractors")?.colSpan ?? 1
  const isFullWidth = colSpan === 2
  const count = isFullWidth ? 10 : 5

  return (
    <TopSpendWidget
      title={`Top ${count} Subcontractors by Spend`}
      description="Based on AP invoices coded to subcontractors (GL 5200) in the selected year."
      queryKey="topSubcontractorsBySpend"
      totalQueryKey="totalSubcontractorSpend"
      listPath="/subcontractors"
      detailPath="/subcontractors"
      previewCount={count}
      colors={isFullWidth ? SUBCONTRACTOR_COLORS_10 : SUBCONTRACTOR_COLORS_5}
      centerLabel="TOTAL SPEND"
      chartSize={isFullWidth ? "lg" : "md"}
    />
  )
}
