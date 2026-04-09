import { useDashboardLayout } from "../context/DashboardLayoutContext"
import { TopSpendWidget } from "./TopSpendWidget"
import { SUPPLIER_COLORS_5, SUPPLIER_COLORS_10 } from "../../../shared/config/chartColors"

export function TopSuppliersWidget() {
  const { layout } = useDashboardLayout()
  const colSpan = layout.widgets.find((w) => w.id === "topSuppliers")?.colSpan ?? 1
  const isFullWidth = colSpan === 2
  const count = isFullWidth ? 10 : 5

  return (
    <TopSpendWidget
      title={`Top ${count} Material Suppliers by Spend`}
      description="Based on AP invoices coded to materials (GL 5500) in the selected year"
      queryKey="topMaterialSuppliersBySpend"
      totalQueryKey="totalMaterialSpend"
      listPath="/suppliers"
      detailPath="/suppliers"
      previewCount={count}
      colors={isFullWidth ? SUPPLIER_COLORS_10 : SUPPLIER_COLORS_5}
      centerLabel="TOTAL SPEND"
      chartSize={isFullWidth ? "lg" : "md"}
    />
  )
}
