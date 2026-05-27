// Shape of a user's customizable dashboard layout, persisted via layoutApi.ts
// (GET/PUT /user/dashboard-layout). The backend stores this verbatim as a
// schemaless document, so the frontend owns this contract.

export interface DashboardWidgetLayout {
  /** Stable widget identifier (matches the widget key rendered on the dashboard). */
  id: string
  /** Display order within the grid (ascending). */
  order: number
  /** Whether the user has hidden this widget. */
  hidden?: boolean
  /** Optional grid column span (1 = full-width single column). */
  colSpan?: number
}

export interface DashboardLayout {
  /** Schema version, bumped when the layout shape changes. */
  version: number
  /** Per-widget placement, in render order. */
  widgets: DashboardWidgetLayout[]
}
