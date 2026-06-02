import type { DashboardLayout, SectionId, WidgetLayoutItem } from "../types/dashboardLayout"
import { DEFAULT_DASHBOARD_LAYOUT } from "./defaultLayout"

// Named starting layouts the user can reset their home page to. Each template
// is a section ordering plus, optionally, per-section widget composition
// overrides. Sections without an override reset to their default composition.

export interface LayoutTemplate {
  id: string
  name: string
  /** Short one-liner shown in the "Reset view" dropdown and welcome cards. */
  description: string
  sectionOrder: SectionId[]
  /**
   * Per-section widget composition overrides. A section listed here replaces
   * the default widget set/sizes for that section; omitted sections fall back
   * to DEFAULT_DASHBOARD_LAYOUT's composition.
   */
  sectionWidgets?: Partial<Record<SectionId, WidgetLayoutItem[]>>
}

export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    id: "operations",
    name: "Operations",
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
  {
    id: "procurement",
    name: "Procurement",
    description: "Reports & relations first",
    sectionOrder: [
      "reports",
      "businessRelations",
      "businessFinancials",
      "businessPerformance",
      "businessDevelopment",
      "financialTrends",
    ],
    // Procurement leads Business Relations with suppliers rather than clients.
    sectionWidgets: {
      businessRelations: [
        { id: "vendorInsights", colSpan: 2 },
        { id: "clientInsights", colSpan: 1 },
        { id: "subcontractorInsights", colSpan: 1 },
      ],
    },
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
]

/**
 * Build a full layout for a template: the default widget composition with the
 * sections reordered per the template, and any per-section widget overrides
 * applied. Sections the template omits are appended in their default order so
 * nothing is ever lost.
 */
export function buildTemplateLayout(template: LayoutTemplate): DashboardLayout {
  const bySection = new Map(DEFAULT_DASHBOARD_LAYOUT.sections.map((s) => [s.id, s]))
  const ordered: SectionId[] = []
  const seen = new Set<SectionId>()
  for (const id of [...template.sectionOrder, ...DEFAULT_DASHBOARD_LAYOUT.sections.map((s) => s.id)]) {
    if (bySection.has(id) && !seen.has(id)) {
      seen.add(id)
      ordered.push(id)
    }
  }
  return {
    version: 2,
    columns: 2,
    sections: ordered.map((id) => {
      const override = template.sectionWidgets?.[id]
      if (override) return { id, widgets: structuredClone(override) }
      return structuredClone(bySection.get(id)!)
    }),
  }
}
