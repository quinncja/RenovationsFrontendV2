import { useState, type ReactNode } from "react"
import Page from "../../shared/components/Page"
import { PageDataProvider } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { PeriodSelector, periodToParams, type Period } from "../../shared/components/PeriodSelector/PeriodSelector"
import { DashboardLayoutProvider, useDashboardLayout } from "./context/DashboardLayoutContext"
import { WIDGET_REGISTRY } from "./config/widgetRegistry"
import { DashboardEditor } from "./components/DashboardEditor"
import { EditModeToggle } from "./components/EditModeToggle"
import { EditModeToolbar } from "./components/EditModeToolbar"

interface DashboardContentProps {
  year: number
  setYear: (year: number) => void
  period: Period
  setPeriod: (period: Period) => void
}

function DashboardContent({ year, setYear, period, setPeriod }: DashboardContentProps) {
  const { layout, isEditing, isLoading } = useDashboardLayout()

  return (
    <Page
      title="Dashboard"
      stickyHeader={isEditing}
      actions={
        isEditing ? (
          <EditModeToolbar />
        ) : (
          <>
            <PeriodSelector value={period} onChange={setPeriod} />
            <YearSelector value={year} onChange={setYear} />
            <EditModeToggle />
          </>
        )
      }
    >
      {isLoading ? (
        <div className="widget-grid widget-grid-2">
          <div className="widget card"><div className="widget-skeleton" /></div>
          <div className="widget card"><div className="widget-skeleton" /></div>
        </div>
      ) : isEditing ? (
        <DashboardEditor />
      ) : (
        <MotionList className="widget-grid widget-grid-2">
          {layout.widgets.flatMap((item) => {
            const elements: ReactNode[] = []
            // Render an invisible spacer for offset (pushes widget to right column)
            if (item.offset && item.offset > 0 && item.colSpan === 1) {
              elements.push(<div key={`spacer-${item.id}`} className="widget-grid-spacer" />)
            }
            const entry = WIDGET_REGISTRY[item.id]
            const Component = entry.component
            elements.push(
              <MotionItem
                key={item.id}
                className={item.colSpan === 2 ? "col-span-full" : undefined}
              >
                <Component />
              </MotionItem>
            )
            return elements
          })}
        </MotionList>
      )}
    </Page>
  )
}

export default function Dashboard() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [period, setPeriod] = useState<Period>("annual")

  return (
    <PageDataProvider
      module="dashboard"
      queries={PAGE_QUERIES.adminDashboard}
      params={{ year, ...periodToParams(period) }}
    >
      <DashboardLayoutProvider>
        <DashboardContent year={year} setYear={setYear} period={period} setPeriod={setPeriod} />
      </DashboardLayoutProvider>
    </PageDataProvider>
  )
}
