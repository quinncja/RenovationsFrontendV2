import { MotionList, MotionItem } from "../../../shared/components/MotionList/MotionList"
import { EmployeePeriodAndYearSummary } from "../widgets/EmployeePeriodAndYearSummary"
import { ReportWidget } from "../widgets/reports/ReportWidget"
import { StatCardRow, type HomeModalKind } from "./StatCardRow"
import { WhatsChangedRow } from "./WhatsChangedRow"
import type { Breakdown, ProjectRow } from "./breakdownRows"

/**
 * Section 1 of the PM/GM home: the centered stat-card row (with drill-down
 * modals owned by the page), the period/year snapshot, then the What's
 * Changed timeline.
 */
export function CurrentPerformanceSection({
  watchlistProjects,
  openProjects,
  closedProjects,
  monthly,
  yearly,
  isLoading,
  allTimeLoading,
  year,
  gmHome,
  onOpenModal,
}: {
  watchlistProjects: ProjectRow[]
  openProjects: ProjectRow[]
  closedProjects: ProjectRow[]
  monthly: Breakdown["stats"]["monthly"] | undefined
  yearly: Breakdown["stats"]["yearly"] | undefined
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
      {/* GM home: the data-validation report pills as a slim centered strip
          under the stat row — one quiet line instead of a bulky fourth card. */}
      {gmHome && (
        <MotionItem>
          <div className="gm-reports-strip">
            <span className="gm-reports-strip-title headline">Reports</span>
            <div className="gm-reports-strip-pills">
              <ReportWidget reportId="reconciliation" compact />
              <ReportWidget reportId="dataQuality" compact />
              <ReportWidget reportId="missingContracts" compact />
              <ReportWidget reportId="openProjectsNoBudget" compact />
              <ReportWidget reportId="missingUnitCounts" compact />
              <ReportWidget reportId="missingOneOffNames" compact />
            </div>
          </div>
        </MotionItem>
      )}
      <MotionItem>
        <WhatsChangedRow queryName={gmHome ? "whatsChangedGm" : "whatsChangedPm"} />
      </MotionItem>
      <MotionItem>
        <EmployeePeriodAndYearSummary monthly={monthly} yearly={yearly} loading={isLoading} />
      </MotionItem>
    </MotionList>
  )
}
