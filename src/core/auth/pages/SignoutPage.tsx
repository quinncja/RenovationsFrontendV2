import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { signOut } from "firebase/auth"
import { auth } from "../firebase"
import Logo from "../../components/Logo"

export default function SignoutPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  async function handleSignOut() {
    setLoading(true)
    await signOut(auth)
    navigate("/login", { replace: true })
  }

  return (
    <div className="login-page">
      <div className="login-background" />
      <div className="auth-card">
        <div className="auth-card-header">
          <Logo size={48} variant="white" />
          <h1 className="title1">Sign out</h1>
          <p className="body-text">You will be returned to the login screen.</p>
        </div>
        <div className="auth-form">
          <button className="button auth-submit" onClick={handleSignOut} disabled={loading}>
            {loading ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  )
}
