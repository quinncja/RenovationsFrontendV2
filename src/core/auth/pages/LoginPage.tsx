import { useState, useEffect } from "react"
import { ChartColumn, ChevronRight } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, signOut } from "firebase/auth"
import { auth } from "../firebase"
import { useAuth } from "../AuthProvider"
import { ALLOWED_EMAIL_DOMAIN, DOMAIN_ERROR, isAllowedEmail } from "../domain"
import LoadingScreen from "../../components/LoadingScreen"
import Logo from "../../components/Logo"
import useIsMobile from "../../../shared/hooks/useIsMobile"

// On a phone, the signed-out landing first asks which app: RD Expenses (the
// cardholder app, no dashboard account) or the dashboard. Choosing the
// dashboard is remembered on that phone.
const PORTAL_KEY = "rd:portal"
const phoneLike = /iPhone|iPod|Android.+Mobile/.test(navigator.userAgent)
function remembered() {
  try {
    return localStorage.getItem(PORTAL_KEY) === "dashboard"
  } catch {
    return false
  }
}

/** Firebase's raw error strings leak SDK internals; map the common sign-in
 *  failures to something a person can act on. */
function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string }).code ?? ""
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password."
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again."
    case "auth/invalid-email":
      return "That email address is not valid."
    default:
      return (err as Error).message
  }
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const isMobile = useIsMobile()
  const [portal, setPortal] = useState(() => !remembered())

  useEffect(() => {
    if (!authLoading && user) {
      navigate("/dashboard", { replace: true })
    }
  }, [user, authLoading, navigate])

  // Every landing passes through here (/ redirects to /login), including
  // already-signed-in users — painting the form before auth resolves flashes
  // it at them for a beat. Hold until we know; a signed-in user then goes
  // straight to the redirect above without ever seeing the form.
  if (authLoading || user) {
    return <LoadingScreen />
  }

  if ((isMobile || phoneLike) && portal) {
    return (
      <main className="portal">
        <div className="login-background" />
        <header className="portal-brand">
          <Logo size={44} />
          <span className="portal-brand-name">Renovations Delivered</span>
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
              onClick={() => {
                try {
                  localStorage.setItem(PORTAL_KEY, "dashboard")
                } catch {
                  // Not remembered; they'll be asked next visit.
                }
                setPortal(false)
              }}
            >
              <span className="portal-tile portal-tile--expenses">
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

  async function handleGoogleLogin() {
    setError("")
    setLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      // Hint Google to the company Workspace; still verified below since `hd` isn't enforced.
      provider.setCustomParameters({ hd: ALLOWED_EMAIL_DOMAIN })
      const result = await signInWithPopup(auth, provider)
      if (!isAllowedEmail(result.user.email)) {
        await signOut(auth)
        setError(DOMAIN_ERROR)
        return
      }
      navigate("/dashboard")
    } catch (err: unknown) {
      setError(friendlyAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const result = await signInWithEmailAndPassword(auth, email, password)
      if (!isAllowedEmail(result.user.email)) {
        await signOut(auth)
        setError("This account does not have dashboard access.")
        return
      }
      navigate("/dashboard")
    } catch (err: unknown) {
      setError(friendlyAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-background" />
      <div className="auth-card">
        <div className="auth-card-header">
          <Logo size={48} />
          <h1 className="title1">Welcome</h1>
        </div>
        {error && <p className="auth-error">{error}</p>}
        <div className="auth-panels">
          <section className="auth-panel">
            <p className="auth-panel-label">Renovations Delivered employees</p>
            <button className="button auth-google" onClick={handleGoogleLogin} disabled={loading}>
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.08 24.08 0 0 0 0 21.56l7.98-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continue with Google
            </button>
          </section>
          <section className="auth-panel">
            <p className="auth-panel-label">External partners</p>
            <form className="auth-form" onSubmit={handleEmailLogin}>
              <div className="form-field">
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="form-field">
                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <button type="submit" className="auth-submit" disabled={loading || !email.trim() || !password}>
                Sign in
              </button>
            </form>
          </section>
        </div>
        {(isMobile || phoneLike) && (
          <a className="login-portal-switch" href="/card/">
            Looking for RD Expenses? Open the card receipts app
          </a>
        )}
      </div>
    </div>
  )
}
