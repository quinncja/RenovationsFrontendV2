import { Navigate, useNavigate } from "react-router-dom"
import { ChartColumn, ChevronRight } from "lucide-react"
import { useAuth } from "../AuthProvider"
import LoadingScreen from "../../components/LoadingScreen"
import Logo from "../../components/Logo"
import LogoText from "../../components/LogoText"
import useIsMobile from "../../../shared/hooks/useIsMobile"

const phoneLike = /iPhone|iPod|Android.+Mobile/.test(navigator.userAgent)

// rddashboard.com/ — a signed-out phone picks an app: RD Expenses (the
// cardholder app at /card, no dashboard account) or the dashboard sign-in
// at /login. Each is its own URL, so back and forward move between them.
// Computers go straight to sign-in; signed-in people to the dashboard.
export default function PortalPage() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const isMobile = useIsMobile()
  if (loading) return <LoadingScreen />
  if (user) return <Navigate to="/dashboard" replace />
  if (!isMobile && !phoneLike) return <Navigate to="/login" replace />
    return (
      <main className="portal">
        <div className="login-background" />
        <header className="portal-brand">
          <Logo size={36} />
          <LogoText />
        </header>
        <div className="portal-body">
          <h1 className="portal-title">Welcome</h1>
          <p className="portal-sub">Choose where you'd like to go.</p>
          <nav className="portal-list" aria-label="Open an app">
            <a className="portal-row" href="/card/">
              <span className="portal-tile portal-tile--expenses">
                <img src="/r-logo.png" alt="" />
              </span>
              <span className="portal-text">
                <b>RD Expenses</b>
                <span>Receipts and returns for your company card</span>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </a>
            <button
              type="button"
              className="portal-row"
              onClick={() => navigate("/login")}
            >
              <span className="portal-tile portal-tile--dashboard">
                <img src="/r-logo.png" alt="" />
                <span className="portal-tile-badge" aria-hidden="true">
                  <ChartColumn size={13} strokeWidth={2.5} />
                </span>
              </span>
              <span className="portal-text">
                <b>RD Dashboard</b>
                <span>Reports and job costing for staff</span>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </nav>
        </div>
        <footer className="portal-foot">Need help? qsieja@renovationsdelivered.com</footer>
      </main>
    )
}
