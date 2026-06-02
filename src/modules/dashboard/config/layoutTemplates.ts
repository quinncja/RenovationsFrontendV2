import type { DashboardLayout, SectionId } from "../types/dashboardLayout"
import { DEFAULT_DASHBOARD_LAYOUT } from "./defaultLayout"

// Named starting layouts the user can reset their home page to. Each template
// is just a section ordering — the widgets within each section reset to their
// default composition.

export interface LayoutTemplate {
  id: string
  name: string
  description: string
  sectionOrder: SectionId[]
}

export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    id: "operations",
    name: "Operations",
    description: "Reports & relations first",
    sectionOrder: [
      "reports",
      "businessRelations",
      "businessFinancials",
      "businessPerformance",
      "businessDevelopment",
      "financialTrends",
    ],
  },
  {
    id: "financial",
    name: "Financial",
    description: "Financials & trends first",
    sectionOrder: [
      "businessFinancials",
      "financialTrends",
      "businessPerformance",
      "businessDevelopment",
      "businessRelations",
      "reports",
    ],
  },
  {
    id: "owner",
    name: "Owner",
    description: "Growth & performance first",
    sectionOrder: [
      "businessDevelopment",
      "businessPerformance",
      "businessRelations",
      "businessFinancials",
      "financialTrends",
      "reports",
    ],
  },
]

/**
 * Build a full layout for a template: the default widget composition with the
 * sections reordered per the template. Any sections the template omits are
 * appended in their default order so nothing is ever lost.
 */
export function buildTemplateLayout(sectionOrder: SectionId[]): DashboardLayout {
  const bySection = new Map(DEFAULT_DASHBOARD_LAYOUT.sections.map((s) => [s.id, s]))
  const ordered: SectionId[] = []
  const seen = new Set<SectionId>()
  for (const id of [...sectionOrder, ...DEFAULT_DASHBOARD_LAYOUT.sections.map((s) => s.id)]) {
    if (bySection.has(id) && !seen.has(id)) {
      seen.add(id)
      ordered.push(id)
    }
  }
  return {
    version: 2,
    columns: 2,
    sections: ordered.map((id) => structuredClone(bySection.get(id)!)),
  }
}
