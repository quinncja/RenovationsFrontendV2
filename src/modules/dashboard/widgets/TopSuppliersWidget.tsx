import { TopSpendWidget } from "./TopSpendWidget"

const MATERIAL_COLORS = [
  "#14532d", "#15803d", "#16a34a", "#22c55e", "#86efac",
]

export function TopSuppliersWidget() {
  return (
    <TopSpendWidget
      title="Top 5 Material Suppliers by Spend"
      description="Based on AP invoices coded to materials (GL 5500) in the selected year"
      queryKey="topMaterialSuppliersBySpend"
      totalQueryKey="totalMaterialSpend"
      listPath="/suppliers"
      detailPath="/suppliers"
      previewCount={5}
      colors={MATERIAL_COLORS}
      centerLabel="TOTAL SPEND"
      chartSize="md"
    />
  )
}
