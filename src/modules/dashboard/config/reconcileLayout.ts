import type {
  DashboardLayout,
  SectionId,
  SectionLayout,
  WidgetId,
  WidgetLayoutItem,
} from "../types/dashboardLayout"
import { WIDGET_REGISTRY } from "./widgetRegistry"
import {
  SECTION_ORDER,
  SECTION_REGISTRY,
  WIDGET_DEFAULT_ORDER,
  WIDGET_HOME_SECTION,
} from "./sectionRegistry"
import { DEFAULT_DASHBOARD_LAYOUT, LAYOUT_VERSION } from "./defaultLayout"

const KNOWN_WIDGET_IDS = new Set<string>(Object.keys(WIDGET_REGISTRY))
const KNOWN_SECTION_IDS = new Set<string>(Object.keys(SECTION_REGISTRY))

// Legacy v1 widget ids that were split into multiple v2 widgets. Applied ONLY
// when migrating a v1 document — in v2 `upcomingBillings` already means the
// chart-only widget and must NOT be expanded.
const V1_ID_REMAP: Record<string, WidgetId[]> = {
  reports: ["reconciliation", "dataQuality", "missingContracts"],
  upcomingBillings: ["billings"],
}

interface RawItem {
  id?: unknown
  colSpan?: unknown
  offset?: unknown
}

/** Coerce a raw persisted item into a valid WidgetLayoutItem, or null if unknown. */
function normalizeItem(raw: RawItem): WidgetLayoutItem | null {
  if (typeof raw?.id !== "string" || !KNOWN_WIDGET_IDS.has(raw.id)) return null
  const colSpan: 1 | 2 = raw.colSpan === 2 ? 2 : 1
  const item: WidgetLayoutItem = { id: raw.id as WidgetId, colSpan }
  if (typeof raw.offset === "number" && raw.offset > 0 && colSpan === 1) {
    item.offset = raw.offset
  }
  return item
}

/** Expand a v1 item through the split-widget remap, dropping unknown ids. */
function expandV1Item(raw: RawItem): WidgetLayoutItem[] {
  if (typeof raw?.id === "string" && V1_ID_REMAP[raw.id]) {
    // A monolith split into several widgets — each takes its registry default
    // size (the old combined span shouldn't carry over to the parts).
    return V1_ID_REMAP[raw.id].map((id) => ({ id, colSpan: WIDGET_REGISTRY[id].defaultColSpan }))
  }
  const normalized = normalizeItem(raw)
  return normalized ? [normalized] : []
}

/**
 * Build the final sectioned layout from an ordered stream of (already known +
 * normalized) widget items plus a desired section order. Pins every widget to
 * its WIDGET_HOME_SECTION (enforcing "exactly one section"), preserves the
 * order widgets were encountered in within each section, dedupes by id, and
 * appends any registry widget missing from its home section.
 */
function assembleSections(
  orderedItems: WidgetLayoutItem[],
  sectionOrder: SectionId[]
): SectionLayout[] {
  const bucket: Record<SectionId, WidgetLayoutItem[]> = {
    reports: [],
    businessDevelopment: [],
    businessPerformance: [],
    financialTrends: [],
    businessFinancials: [],
    businessRelations: [],
  }
  const seen = new Set<WidgetId>()

  for (const item of orderedItems) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    bucket[WIDGET_HOME_SECTION[item.id]].push(item)
  }

  // Append any registry widget the saved doc didn't include, into its home
  // section, in the canonical default order.
  for (const id of WIDGET_DEFAULT_ORDER) {
    if (seen.has(id)) continue
    seen.add(id)
    bucket[WIDGET_HOME_SECTION[id]].push({ id, colSpan: WIDGET_REGISTRY[id].defaultColSpan })
  }

  // Section order = requested order (valid + deduped) then any missing sections.
  const orderedSectionIds: SectionId[] = []
  const seenSections = new Set<SectionId>()
  for (const id of [...sectionOrder, ...SECTION_ORDER]) {
    if (KNOWN_SECTION_IDS.has(id) && !seenSections.has(id)) {
      seenSections.add(id)
      orderedSectionIds.push(id)
    }
  }

  return orderedSectionIds.map((id) => ({ id, widgets: bucket[id] }))
}

/**
 * One-time, version-gated migrations applied after a saved layout is reconciled.
 * Each gate runs only when the saved doc predates that version, so a user who
 * has since re-customized (and been persisted at the current LAYOUT_VERSION) is
 * left untouched.
 */
function migrateSections(sections: SectionLayout[], savedVersion: number): SectionLayout[] {
  // v3 — force the Business Financials section to the canonical layout (Banking
  // & Overdue full width; Progress Billings + Upcoming Billings half width on
  // the next row). Only this section is overridden; every other section keeps
  // the user's saved order and sizes.
  if (savedVersion < 3) {
    const canonical = DEFAULT_DASHBOARD_LAYOUT.sections.find((s) => s.id === "businessFinancials")
    if (canonical) {
      sections = sections.map((s) =>
        s.id === "businessFinancials" ? { ...s, widgets: structuredClone(canonical.widgets) } : s
      )
    }
  }
  return sections
}

/**
 * Reconciles a saved layout (v1 flat or v2+ sectioned) against the current
 * registries: migrates v1 → sectioned, remaps split widget ids, drops widgets
 * that no longer exist, preserves the user's order, appends any registry widgets
 * the saved layout doesn't have, then runs version-gated migrations. Guarantees
 * every widget lives in exactly one section. Returns the canonical default for
 * unrecognizable input.
 */
export function reconcileLayout(saved: unknown): DashboardLayout {
  if (!saved || typeof saved !== "object") {
    return structuredClone(DEFAULT_DASHBOARD_LAYOUT)
  }

  const doc = saved as { version?: unknown; sections?: unknown; widgets?: unknown }
  const savedVersion = typeof doc.version === "number" ? doc.version : 0

  // ── Sectioned format (v2+) ─────────────────────────────────────────
  if (Array.isArray(doc.sections)) {
    const orderedItems: WidgetLayoutItem[] = []
    const savedSectionOrder: SectionId[] = []

    for (const rawSection of doc.sections as Array<{ id?: unknown; widgets?: unknown }>) {
      if (typeof rawSection?.id === "string" && KNOWN_SECTION_IDS.has(rawSection.id)) {
        savedSectionOrder.push(rawSection.id as SectionId)
      }
      const widgets = Array.isArray(rawSection?.widgets) ? rawSection.widgets : []
      for (const raw of widgets as RawItem[]) {
        const normalized = normalizeItem(raw)
        if (normalized) orderedItems.push(normalized)
      }
    }

    const sections = migrateSections(assembleSections(orderedItems, savedSectionOrder), savedVersion)
    return { version: LAYOUT_VERSION, columns: 2, sections }
  }

  // ── v1: flat widget list → migrate to sectioned ────────────────────
  if (doc.version === 1 || Array.isArray(doc.widgets)) {
    const widgets = Array.isArray(doc.widgets) ? doc.widgets : []
    const orderedItems = (widgets as RawItem[]).flatMap(expandV1Item)
    const sections = migrateSections(assembleSections(orderedItems, SECTION_ORDER), savedVersion)
    return { version: LAYOUT_VERSION, columns: 2, sections }
  }

  return structuredClone(DEFAULT_DASHBOARD_LAYOUT)
}
