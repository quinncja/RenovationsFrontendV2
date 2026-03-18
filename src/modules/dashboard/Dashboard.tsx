import { useState } from "react"
import Page from "../../shared/components/Page"
import { PageDataProvider } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { YearRevenueWidget } from "./widgets/YearRevenueWidget"
import { AllTimeRevenueWidget } from "./widgets/AllTimeRevenueWidget"
import { AnnualRevenueWidget } from "./widgets/AnnualRevenueWidget"
import { GrossRevenueWidget } from "./widgets/GrossRevenueWidget"
import { SpendingByMonthWidget } from "./widgets/SpendingByMonthWidget"
import { NetRevenueWidget } from "./widgets/NetRevenueWidget"
import { TopClientsWidget } from "./widgets/TopClientsWidget"
import { TopSuppliersWidget } from "./widgets/TopSuppliersWidget"
import { TopSubcontractorsWidget } from "./widgets/TopSubcontractorsWidget"

interface DashboardContentProps {
  year: number
  setYear: (year: number) => void
}

function DashboardContent({ year, setYear }: DashboardContentProps) {
  return (
    <Page
      title="Dashboard"
      actions={<YearSelector value={year} onChange={setYear} />}
    >
      <MotionList className="widget-grid widget-grid-2">
        <MotionItem>
          <YearRevenueWidget />
        </MotionItem>
        <MotionItem>
          <AllTimeRevenueWidget />
        </MotionItem>
        <MotionItem className="col-span-full">
          <AnnualRevenueWidget />
        </MotionItem>
        <MotionItem>
          <GrossRevenueWidget />
        </MotionItem>
        <MotionItem>
          <SpendingByMonthWidget />
        </MotionItem>
        <MotionItem>
          <NetRevenueWidget />
        </MotionItem>
        <MotionItem className="col-span-full">
          <TopClientsWidget />
        </MotionItem>
        <MotionItem>
          <TopSuppliersWidget />
        </MotionItem>
        <MotionItem>
          <TopSubcontractorsWidget />
        </MotionItem>
      </MotionList>
    </Page>
  )
}

export default function Dashboard() {
  const [year, setYear] = useState(new Date().getFullYear())

  return (
    <PageDataProvider
      module="dashboard"
      queries={PAGE_QUERIES.adminDashboard}
      params={{ year }}
    >
      <DashboardContent year={year} setYear={setYear} />
    </PageDataProvider>
  )
}
