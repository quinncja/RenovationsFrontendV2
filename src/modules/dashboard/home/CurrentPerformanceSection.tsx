import { MotionList, MotionItem } from "../../../shared/components/MotionList/MotionList"
import { StatCardRow, type HomeModalKind } from "./StatCardRow"
import { WhatsChangedRow } from "./WhatsChangedRow"
import type { ProjectRow } from "./breakdownRows"

/**
 * Section 1 of the PM/GM home: the full-width stat band (with drill-down
 * modals owned by the page) above the What's Changed timeline. Two blocks
 * only — the period/year snapshot lives in Performance Over Time now — so
 * the section is set airy on purpose (see .home-current-stack).
 */
export function CurrentPerformanceSection({
  watchlistProjects,
  openProjects,
  closedProjects,
  isLoading,
  allTimeLoading,
  year,
  gmHome,
  onOpenModal,
}: {
  watchlistProjects: ProjectRow[]
  openProjects: ProjectRow[]
  closedProjects: ProjectRow[]
  isLoading: boolean
  allTimeLoading: boolean
  year: number
  gmHome?: boolean
  onOpenModal: (kind: HomeModalKind) => void
}) {
  return (
    <MotionList className="home-current-stack">
      <MotionItem>
        <StatCardRow
          watchlistProjects={watchlistProjects}
          openProjects={openProjects}
          closedProjects={closedProjects}
          isLoading={isLoading}
          allTimeLoading={allTimeLoading}
          year={year}
          onOpenModal={onOpenModal}
        />
      </MotionItem>
      <MotionItem>
        <WhatsChangedRow queryName={gmHome ? "whatsChangedGm" : "whatsChangedPm"} />
      </MotionItem>
    </MotionList>
  )
}
