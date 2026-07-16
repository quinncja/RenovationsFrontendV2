// Shared job-cost shapes used by the detail page, the list page, and the
// reusable CostBreakdownTable.

export interface BudgetBreakdown {
  Material: number
  Labor: number
  Subcontractor: number
  WTPM: number
  Total: number
}

export interface CostItem {
  costType: string
  category: number
  id: string
  recnum: string
  committedAmount: number
  postedAmount: number
  dscrpt: string
  status: number
  // Row provenance + drill-down key (see getAllCostItems in the backend):
  // 'po' rows open the purchase order, 'sub' rows the subcontract (linkRecnum
  // is the pchord/subcon HEADER recnum — ordnum/ctcnum aren't queryable), and
  // 'cost' rows open the AP invoice they were posted from (linkRecnum null =
  // payroll/journal posting, nothing to open). Optional because a backend
  // still on the previous deploy won't send them — rows just aren't clickable.
  itemType?: "cost" | "po" | "sub"
  linkRecnum?: string | null
  insdte?: string
  insusr?: string | null
}

export const COST_TYPES = ["Material", "Labor", "Subcontractor", "WTPM"] as const

export interface CostGroup {
  key: string
  budget: number
  actual: number
  variance: number
  variancePct: number | null
  items: CostItem[]
}

// Pure cost-type rollup: budget (getBudgetByRecnum) vs actual (committed +
// posted), per cost type, plus grand totals. Shared so the detail page and
// the Job Costing list reuse the same numbers as the Cost Breakdown table.
export function computeCostGroups(budget: BudgetBreakdown | null, costItems: CostItem[]) {
  const groups: CostGroup[] = COST_TYPES.map((key) => {
    const items = costItems.filter((c) => c.costType === key)
    const actual = items.reduce((s, c) => s + (c.committedAmount || 0) + (c.postedAmount || 0), 0)
    const b = budget?.[key] ?? 0
    return {
      key,
      budget: b,
      actual,
      variance: b - actual,
      variancePct: b !== 0 ? ((b - actual) / b) * 100 : null,
      items,
    }
  })
  const totalBudget = groups.reduce((s, g) => s + g.budget, 0)
  const totalActual = groups.reduce((s, g) => s + g.actual, 0)
  const totalVariance = totalBudget - totalActual
  return { groups, totalBudget, totalActual, totalVariance }
}
