import Page from "../../shared/components/Page"
import { PageDataProvider } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import { PeriodAndYearSummaryWidget } from "../dashboard/widgets/PeriodAndYearSummaryWidget"
import { MarginWidget } from "../dashboard/widgets/MarginWidget"
import { EmployeePerformanceWidget } from "../dashboard/widgets/EmployeePerformanceWidget"

export default function BusinessSummaryPage() {
  const [year, setYear] = useLocalStorage("businessSummaryYear", new Date().getFullYear())

  return (
    <PageDataProvider module="businessSummary" queries={PAGE_QUERIES.businessSummary} params={{ year }}>
      <Page title="Company Overview" actions={<YearSelector value={year} onChange={setYear} />}>
        <MotionList className="widget-grid widget-grid-2 dashboard-home-grid">
          <MotionItem className="col-span-full">
            <PeriodAndYearSummaryWidget />
          </MotionItem>
          <MotionItem>
            <MarginWidget />
          </MotionItem>
          <MotionItem>
            <EmployeePerformanceWidget />
          </MotionItem>
        </MotionList>
      </Page>
    </PageDataProvider>
  )
}
