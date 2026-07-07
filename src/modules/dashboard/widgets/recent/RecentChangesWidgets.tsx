import { RecentChangesWidget } from "./RecentChangesWidget"

/** Admin registry entries — the Recent Changes section is two side-by-side
 *  widgets: project activity (new jobs, POs & subs, costs) and billing
 *  (AR invoices, payments), both company-wide. */
export function RecentActivityWidget() {
  return <RecentChangesWidget source="admin" group="activity" />
}

export function RecentBillingWidget() {
  return <RecentChangesWidget source="admin" group="billing" />
}

/** Manager-home placement: the manager dashboard is the fixed EmployeeDetail
 *  page (no section registry), so the widget is hand-placed there. One
 *  activity widget, token-scoped to the manager's own jobs — a PM's recent
 *  changes all revolve around their projects, so no billing split. */
export function PmRecentChangesSection() {
  return <RecentChangesWidget source="pm" group="activity" />
}
