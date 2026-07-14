import { useState } from "react"
import Page from "../../shared/components/Page"
import useIsMobile from "../../shared/hooks/useIsMobile"
import { PageDataProvider } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import { useAuth } from "../../core/auth/AuthProvider"
import { effectiveRole, isGeneralManager, ALL_JOBS_DETAIL_ID, type AppRole } from "../../core/auth/roles"
import { DashboardLayoutProvider, useDashboardLayout } from "./context/DashboardLayoutContext"
import { SectionPager } from "./components/SectionPager"
import { SectionEditor } from "./components/SectionEditor"
import { EditModeToolbar } from "./components/EditModeToolbar"
import { DashboardHeaderActions } from "./components/DashboardHeaderActions"
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

  // A General Manager oversees every PM rather than a single job, so their home
  // is the same per-employee breakdown view but scoped to the all-jobs sentinel
  // (the backend aggregates across all supervisors). This is an interim home —
  // a GM-specific layout (PM roster / cross-job rollups) is a planned follow-up.
  if (isGeneralManager(role)) {
    return (
      <PageDataProvider
        module="dashboard"
        queries={PAGE_QUERIES.generalManagerHome}
        params={{ detailId: ALL_JOBS_DETAIL_ID, year }}
      >
        <EmployeeDetail
          employeeId={ALL_JOBS_DETAIL_ID}
          year={year}
          onYearChange={setYear}
          isManagerHome
          gmHome
        />
      </PageDataProvider>
    )
  }

  // A manager's home is the per-employee view admins see at /employees/:id,
  // scoped to their own supervisor id (the breakdown queries still honor the
  // client-sent detailId). Their activity feed lives in the daily report
  // modal / Reports page, scoped server-side from the token's employeeId.
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
          isManagerHome
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
  const isMobile = useIsMobile()

  // Dev-only: `?welcome` forces the walkthrough so it can be previewed even when
  // a layout is already saved server-side. Never active in production builds; in
  // preview, picking a layout is non-destructive (see WelcomeWalkthrough).
  // Mobile-gated: on desktop `?welcome` previews the AdminOnboarding tour
  // instead, and forcing the in-page walkthrough there would hide the header
  // actions the tour's coach phases anchor to.
  const [forceWelcome, setForceWelcome] = useState(
    () => import.meta.env.DEV && isMobile && new URLSearchParams(window.location.search).has("welcome")
  )
  // Step two of the walkthrough: point out the gear once they've chosen.
  const [gearHint, setGearHint] = useState(false)
  // Fade the dashboard in the first time it reveals after a welcome selection.
  const [cameFromWelcome, setCameFromWelcome] = useState(false)

  // New user who hasn't picked a layout (or dev preview) → walkthrough, not grid.
  // Constraint: the app-level AdminOnboarding host owns the DESKTOP new-user path
  // now — the in-page walkthrough only serves mobile (and `?welcome` previews).
  const showWelcome = !isEditing && (forceWelcome || (isMobile && !isLoading && !hasChosenLayout))

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
          <DashboardHeaderActions
            year={year}
            onYearChange={onYearChange}
            gearHint={gearHint}
            onGearActivate={() => setGearHint(false)}
          />
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
