import { RecentChangesPanel } from "./RecentChangesPanel"

/** Registry entry for the admin "Recent Changes" section — one full-width
 *  panel (summary tiles + largest movements + detail modal), company-wide
 *  with PM attribution. */
export function RecentActivityWidget() {
  return <RecentChangesPanel source="admin" />
}

/** Manager-home placement: the manager dashboard is the fixed EmployeeDetail
 *  page (no section registry), so the panel is hand-placed there. Token-scoped
 *  to the manager's own jobs; no billing tiles, no PM attribution. */
export function PmRecentChangesSection() {
  return <RecentChangesPanel source="pm" />
}
