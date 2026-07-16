import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, signOut } from "firebase/auth"
import { auth } from "../firebase"
import { useAuth } from "../AuthProvider"
import { ALLOWED_EMAIL_DOMAIN, DOMAIN_ERROR, isAllowedEmail } from "../domain"
import Logo from "../../components/Logo"

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

  useEffect(() => {
    if (!authLoading && user) {
      navigate("/dashboard", { replace: true })
    }
  }, [user, authLoading, navigate])

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
      </div>
    </div>
  )
}
