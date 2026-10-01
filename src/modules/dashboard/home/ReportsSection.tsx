import { MotionList, MotionItem } from "../../../shared/components/MotionList/MotionList"
import {
  ReconciliationWidget,
  DataQualityWidget,
  MissingContractsWidget,
  OpenProjectsNoBudgetWidget,
  MissingUnitCountsWidget,
  MissingOneOffNamesWidget,
  CostTypeMismatchWidget,
} from "../widgets/reports/ReportWidget"

/**
 * GM home's Reports section — the same seven data-validation report widgets the
 * admin home's Reports section shows, in the same three-column grid.
 */
export function ReportsSection() {
  return (
    <MotionList className="widget-grid widget-grid-3 dashboard-home-grid">
      <MotionItem>
        <ReconciliationWidget />
      </MotionItem>
      <MotionItem>
        <DataQualityWidget />
      </MotionItem>
      <MotionItem>
        <MissingContractsWidget />
      </MotionItem>
      <MotionItem>
        <OpenProjectsNoBudgetWidget />
      </MotionItem>
      <MotionItem>
        <MissingUnitCountsWidget />
      </MotionItem>
      <MotionItem>
        <MissingOneOffNamesWidget />
      </MotionItem>
      <MotionItem>
        <CostTypeMismatchWidget />
      </MotionItem>
    </MotionList>
  )
}
