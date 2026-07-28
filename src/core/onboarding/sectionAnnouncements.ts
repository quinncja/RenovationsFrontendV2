// Registry of "new section available" nav announcements — one NavSectionHint
// per shipped section, ordered oldest → newest. Only the NEWEST unseen entry
// ever shows: a user who missed several releases gets one hint, not a queue,
// and the Navbar silently acknowledges the superseded ones so they never
// surface later either. To announce a new section, append an entry here (and
// see the README's recipe for the target registration + page acknowledge).

import type { CoachTargetId } from "./coachTargets"
import { SECTION_OVERHEAD_REPORT } from "./markers"

export interface SectionAnnouncement {
  /** `section:*` milestone key (constant in markers.ts). */
  milestone: string
  /** Nav group label the hint anchors to — the announcement only shows for
   *  roles whose nav actually contains this group. */
  navGroup: string
  /** Coach target the group button registers under (coachTargets.ts). */
  targetId: CoachTargetId
  title: string
  body: string
  /** DEV-only preview query param (`?<param>`); never stamps the milestone. */
  previewParam: string
}

export const SECTION_ANNOUNCEMENTS: SectionAnnouncement[] = [
  {
    milestone: SECTION_OVERHEAD_REPORT,
    navGroup: "Finances",
    targetId: "nav-finances",
    title: "New in Finances",
    body: "Overhead Expense Report now available.",
    previewParam: "overhead-hint",
  },
]
