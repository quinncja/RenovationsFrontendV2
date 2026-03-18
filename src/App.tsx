import { Outlet } from "react-router-dom"
import LoadingScreen from "./core/components/LoadingScreen"
import Navbar from "./core/components/Navbar"
import WaitingRoom from "./core/auth/pages/WaitingRoom"
import useIsInitialized from "./core/auth/hooks/useIsInitialized"
import { useAuth } from "./core/auth/AuthProvider"
import "./App.css"

export default function App() {
  const { user, loading } = useAuth()
  const { isInitialized } = useIsInitialized()

  if (loading) {
    return <LoadingScreen />
  }

  if (user && !isInitialized) {
    return <WaitingRoom />
  }

  return (
    <div className="app">
      <Navbar />
      <Outlet />
    </div>
  )
}
