import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { signInWithEmailAndPassword, SAMLAuthProvider, signInWithPopup } from "firebase/auth"
import { auth } from "../firebase"
import { useAuth } from "../AuthProvider"
import Logo from "../../components/Logo"
import SolarPanelBackground from "../components/SolarPanelBackground"

const SAML_PROVIDER_ID = import.meta.env.VITE_FIREBASE_SAML_PROVIDER_ID as string | undefined

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      navigate("/dashboard")
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSSOLogin() {
    if (!SAML_PROVIDER_ID) return
    setError("")
    setLoading(true)
    try {
      const provider = new SAMLAuthProvider(SAML_PROVIDER_ID)
      await signInWithPopup(auth, provider)
      navigate("/dashboard")
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <SolarPanelBackground />
      <div className="auth-card">
        <div className="auth-card-header">
          <Logo size={48} color="white" />
          <h1 className="title1">Welcome back</h1>
          <p className="body-text">Sign in to your account</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>
          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="button auth-submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {SAML_PROVIDER_ID && (
          <button className="button auth-sso" onClick={handleSSOLogin} disabled={loading}>
            Continue with SSO
          </button>
        )}
      </div>
    </div>
  )
}
