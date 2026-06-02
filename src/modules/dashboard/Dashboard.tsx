import { useMemo, useState } from "react"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { Widget } from "../../shared/components/Widget/Widget"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { StatWidget } from "../../shared/components/StatWidget/StatWidget"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import { useAuth } from "../../core/auth/AuthProvider"
import type { AppRole } from "../../core/auth/roles"
import { DashboardLayoutProvider, useDashboardLayout } from "./context/DashboardLayoutContext"
import { SectionPager } from "./components/SectionPager"
import { SectionEditor } from "./components/SectionEditor"
import { EditModeToggle } from "./components/EditModeToggle"
import { EditModeToolbar } from "./components/EditModeToolbar"
import { WelcomeWalkthrough, GearHintPopover } from "./components/WelcomeWalkthrough"

export default function Dashboard() {
  const { claims } = useAuth()
  const role = claims["role"] as AppRole | undefined
  const isAdmin = role === "executive" || role === "admin"
  const [year, setYear] = useLocalStorage("dashboardYear", new Date().getFullYear())

  const queries = useMemo(
    () => (isAdmin ? PAGE_QUERIES.adminDashboard : PAGE_QUERIES.employeeDashboard),
    [isAdmin]
  )

  return (
    <PageDataProvider module="dashboard" queries={queries} params={{ year }}>
      {isAdmin ? (
        <DashboardLayoutProvider>
          <AdminDashboard year={year} onYearChange={setYear} />
        </DashboardLayoutProvider>
      ) : (
        <PMDashboard year={year} onYearChange={setYear} />
      )}
    </PageDataProvider>
  )
}

// ─── Admin Dashboard (customizable two-column layout) ────────────────

function AdminDashboard({ year, onYearChange }: { year: number; onYearChange: (y: number) => void }) {
  const { isEditing, isLoading, hasChosenLayout } = useDashboardLayout()

  // Dev-only: `?welcome` forces the walkthrough so it can be previewed even when
  // a layout is already saved server-side. Never active in production builds; in
  // preview, picking a layout is non-destructive (see WelcomeWalkthrough).
  const [forceWelcome, setForceWelcome] = useState(
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).has("welcome")
  )
  // Step two of the walkthrough: point out the gear once they've chosen.
  const [gearHint, setGearHint] = useState(false)
  // Fade the dashboard in the first time it reveals after a welcome selection.
  const [cameFromWelcome, setCameFromWelcome] = useState(false)

  // New user who hasn't picked a layout (or dev preview) → walkthrough, not grid.
  const showWelcome = !isEditing && (forceWelcome || (!isLoading && !hasChosenLayout))

  function handleChosen() {
    setForceWelcome(false)
    setGearHint(true)
    setCameFromWelcome(true)
  }

  return (
    <Page
      title="Dashboard"
      stickyHeader={isEditing}
      actions={
        isEditing ? (
          <EditModeToolbar />
        ) : showWelcome ? undefined : (
          <>
            <YearSelector value={year} onChange={onYearChange} />
            <EditModeToggle highlight={gearHint} onActivate={() => setGearHint(false)} />
          </>
        )
      }
    >
      {isEditing ? (
        <SectionEditor />
      ) : showWelcome ? (
        <WelcomeWalkthrough preview={forceWelcome} onChosen={handleChosen} />
      ) : isLoading ? (
        <div className="widget-grid widget-grid-2">
          <div className="widget card"><div className="widget-skeleton" /></div>
          <div className="widget card"><div className="widget-skeleton" /></div>
        </div>
      ) : (
        <>
          <SectionPager enterAnimation={cameFromWelcome} />
          {gearHint && <GearHintPopover onDismiss={() => setGearHint(false)} />}
        </>
      )}
    </Page>
  )
}

// ─── PM Dashboard ────────────────────────────────────────────────────

function PMDashboard({ year, onYearChange }: { year: number; onYearChange: (y: number) => void }) {
  const { data, isLoading } = useWidgetData<{
    employeePerformanceBreakdown: Record<string, unknown> | null
    watchlist: unknown[] | null
    projectsMissingContracts: unknown[] | null
    projectCount: Record<string, number> | null
  }>(["employeePerformanceBreakdown", "watchlist", "projectsMissingContracts", "projectCount"])

  const counts = data?.projectCount as Record<string, number> | null

  return (
    <Page title="Dashboard" actions={<YearSelector value={year} onChange={onYearChange} />}>
      <MotionList className="dashboard-grid">
        {/* Project Counts */}
        <MotionItem>
          <Widget title="Project Counts" loading={isLoading} noData={!counts}>
            {counts && (
              <div className="stat-grid">
                {Object.entries(counts).map(([status, count]) => (
                  <StatWidget key={status} title={status} value={count} format="number" />
                ))}
              </div>
            )}
          </Widget>
        </MotionItem>

        {/* Watchlist */}
        <MotionItem>
          <Widget title="Watchlist" loading={isLoading} noData={!data?.watchlist || (data.watchlist as unknown[]).length === 0}>
            {Array.isArray(data?.watchlist) && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.watchlist as { name: string; reason: string }[]).map((item, i) => (
                    <tr key={i}>
                      <td>{item.name}</td>
                      <td>{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Widget>
        </MotionItem>

        {/* My Performance */}
        <MotionItem>
          <Widget title="My Performance" loading={isLoading} noData={!data?.employeePerformanceBreakdown}>
            {data?.employeePerformanceBreakdown && (
              <pre style={{ fontSize: "0.75rem", color: "var(--secondary-text)" }}>
                {JSON.stringify(data.employeePerformanceBreakdown, null, 2)}
              </pre>
            )}
          </Widget>
        </MotionItem>
      </MotionList>
    </Page>
  )
}
