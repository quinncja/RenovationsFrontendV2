import { useState } from "react"
import Page from "../../shared/components/Page"
import { PageDataProvider } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import { useAuth } from "../../core/auth/AuthProvider"
import { effectiveRole, type AppRole } from "../../core/auth/roles"
import { DashboardLayoutProvider, useDashboardLayout } from "./context/DashboardLayoutContext"
import { SectionPager } from "./components/SectionPager"
import { SectionEditor } from "./components/SectionEditor"
import { EditModeToggle } from "./components/EditModeToggle"
import { OverUnderToggle } from "./components/OverUnderToggle"
import { EditModeToolbar } from "./components/EditModeToolbar"
import { WelcomeWalkthrough, GearHintPopover } from "./components/WelcomeWalkthrough"
import { EmployeeDetail } from "./EmployeeDetailPage"

export default function Dashboard() {
  const { claims } = useAuth()
  const role = claims["role"] as AppRole | undefined
  // owner/tech are top-tier and collapse to executive; effectiveRole keeps this
  // home-page decision in lockstep with the route guards (see roles.ts), so new
  // top-tier roles don't silently land on the manager EmployeeDetail view.
  const effRole = effectiveRole(role)
  const isAdmin = effRole === "executive" || effRole === "admin"
  const [year, setYear] = useLocalStorage("dashboardYear", new Date().getFullYear())

  // A manager's home is the per-employee view admins see at /employees/:id,
  // scoped to their own supervisor id (the breakdown queries still honor the
  // client-sent detailId), plus their Recent Changes feed — which the backend
  // scopes from the verified token's employeeId claim, ignoring client params.
  if (!isAdmin) {
    const employeeId = Number(claims["employeeId"])
    return (
      <PageDataProvider
        module="dashboard"
        queries={PAGE_QUERIES.managerHome}
        params={{ detailId: employeeId, year }}
      >
        <EmployeeDetail
          employeeId={employeeId}
          year={year}
          onYearChange={setYear}
          showRecentChanges
        />
      </PageDataProvider>
    )
  }

  return (
    <PageDataProvider module="dashboard" queries={PAGE_QUERIES.adminDashboard} params={{ year }}>
      <DashboardLayoutProvider>
        <AdminDashboard year={year} onYearChange={setYear} />
      </DashboardLayoutProvider>
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
            <OverUnderToggle />
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
