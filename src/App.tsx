import { Outlet } from "react-router-dom"
import LoadingScreen from "./core/components/LoadingScreen"
import Navbar from "./core/components/Navbar"
import MobileNav from "./core/components/MobileNav"
import WaitingRoom from "./core/auth/pages/WaitingRoom"
import SupervisorSelect from "./core/auth/pages/SupervisorSelect"
import useIsInitialized from "./core/auth/hooks/useIsInitialized"
import useNeedsSupervisor from "./core/auth/hooks/useNeedsSupervisor"
import useIsMobile from "./shared/hooks/useIsMobile"
import { useAuth } from "./core/auth/AuthProvider"
import AnalyticsTracker from "./shared/analytics/AnalyticsTracker"
import IdleRefreshOverlay from "./core/components/IdleRefreshOverlay"
import "./App.css"

export default function App() {
  const { user, loading } = useAuth()
  const { isInitialized } = useIsInitialized()
  const { needsSupervisor } = useNeedsSupervisor()
  const isMobile = useIsMobile()

  // Dev-only escape hatch: `?welcome-pm` force-renders the project-manager
  // first-run supervisor picker so it can be previewed/tested without a manager
  // account. Stripped from production builds (import.meta.env.DEV → false).
  const previewPmSelect =
    import.meta.env.DEV && new URLSearchParams(window.location.search).has("welcome-pm")

  if (loading) {
    return <LoadingScreen />
  }

  if (user && previewPmSelect) {
    return <SupervisorSelect preview />
  }

  if (user && !isInitialized) {
    return <WaitingRoom />
  }

  // A manager is "initialized" (has a role) but must still pick which supervisor
  // they are before the app scopes their data — so this gate comes second.
  if (user && needsSupervisor) {
    return <SupervisorSelect />
  }

  return (
    <div className="app">
      <AnalyticsTracker />
      <IdleRefreshOverlay />
      {!isMobile && <Navbar />}
      <Outlet />
      {isMobile && <MobileNav />}
    </div>
  )
}
