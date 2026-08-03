// Registry of "new section available" nav announcements — one NavSectionHint
// per shipped section, ordered oldest → newest. Only the NEWEST unseen entry
// ever shows: a user who missed several releases gets one hint, not a queue,
// and the Navbar silently acknowledges the superseded ones so they never
// surface later either. An entry can opt out of superseding an older hint via
// `requiresSeen`: until that milestone is seen, the entry is simply not
// eligible yet (the older hint shows, nothing gets retired). To announce a new
// section, append an entry here (and see the README's recipe for the target
// registration + page acknowledge).

import type { CoachTargetId } from "./coachTargets"
import { SECTION_JOBCOST_REDESIGN, SECTION_OVERHEAD_REPORT } from "./markers"

export interface SectionAnnouncement {
  /** `section:*` milestone key (constant in markers.ts). */
  milestone: string
  /** Anchor — exactly one of the two: a nav GROUP label, or a leaf nav item's
   *  route path. The announcement only shows for roles whose nav actually
   *  contains that group/item. */
  navGroup?: string
  navPath?: string
  /** Coach target the anchor registers under (coachTargets.ts). */
  targetId: CoachTargetId
  title: string
  body: string
  /** Milestone that must already be seen before this entry becomes eligible —
   *  lets an older announcement have its turn instead of being superseded. */
  requiresSeen?: string
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
  {
    milestone: SECTION_JOBCOST_REDESIGN,
    navPath: "/jobcost",
    targetId: "nav-jobcost",
    title: "Job Costing",
    body: "A new way to jobcost is here.",
    requiresSeen: SECTION_OVERHEAD_REPORT,
    previewParam: "jobcost-hint",
  },
]
