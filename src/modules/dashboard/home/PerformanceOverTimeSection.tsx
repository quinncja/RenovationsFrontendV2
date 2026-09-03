import { MotionList, MotionItem } from "../../../shared/components/MotionList/MotionList"
import { MarginWidget } from "../widgets/MarginWidget"
import { EmployeePerformanceWidget } from "../widgets/EmployeePerformanceWidget"
import { EmployeePeriodAndYearSummary } from "../widgets/EmployeePeriodAndYearSummary"
import { PerformanceCharts } from "./PerformanceCharts"
import type { Breakdown } from "./breakdownRows"

/**
 * Section 2 of the PM/GM home: the Period & Year snapshot pair across the top
 * (moved down from section 1 — it reads as the bridge from "now" into the
 * trends), above the trend charts — the toggled Work Completed + Margin pair
 * for PMs, the company-wide margin + employee performance pair for the GM.
 */
export function PerformanceOverTimeSection({
  monthly,
  yearly,
  isLoading,
  year,
  gmHome,
  billing,
  onYearChange,
}: {
  monthly: Breakdown["stats"]["monthly"] | undefined
  yearly: Breakdown["stats"]["yearly"] | undefined
  isLoading: boolean
  year: number
  gmHome?: boolean
  billing?: Breakdown["billing"]
  /** Home only: puts the page-level year selector in the Year Summary card. */
  onYearChange?: (year: number) => void
}) {
  return (
    <MotionList className="widget-grid widget-grid-2 dashboard-home-grid">
      <MotionItem className="col-span-full">
        <EmployeePeriodAndYearSummary
          monthly={monthly}
          yearly={yearly}
          loading={isLoading}
          onYearChange={onYearChange}
          companyWide={gmHome}
        />
      </MotionItem>

      {gmHome ? (
        <>
          <MotionItem>
            <MarginWidget />
          </MotionItem>
          <MotionItem>
            <EmployeePerformanceWidget />
          </MotionItem>
        </>
      ) : (
        <PerformanceCharts monthly={monthly} yearly={yearly} year={year} isLoading={isLoading} billing={billing} />
      )}
    </MotionList>
  )
}
