import { Outlet } from "react-router-dom"
import LoadingScreen from "./core/components/LoadingScreen"
import Navbar from "./core/components/Navbar"
import MobileNav from "./core/components/MobileNav"
import WaitingRoom from "./core/auth/pages/WaitingRoom"
import useIsInitialized from "./core/auth/hooks/useIsInitialized"
import useIsMobile from "./shared/hooks/useIsMobile"
import { useAuth } from "./core/auth/AuthProvider"
import "./App.css"

export default function App() {
  const { user, loading } = useAuth()
  const { isInitialized } = useIsInitialized()
  const isMobile = useIsMobile()

  if (loading) {
    return <LoadingScreen />
  }

  if (user && !isInitialized) {
    return <WaitingRoom />
  }

  return (
    <div className="app">
      {!isMobile && <Navbar />}
      <Outlet />
      {isMobile && <MobileNav />}
    </div>
  )
}
