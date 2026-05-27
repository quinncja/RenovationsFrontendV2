import { useEffect, useState } from "react"
import { auth } from "../firebase"

// Roles live in the Firebase ID token (custom claims). When an admin assigns a
// role, the user picks it up by refreshing their token — so we just poll a
// forced refresh; AuthProvider's onIdTokenChanged then re-renders and RequireAuth
// admits them automatically. No backend coordination needed.
const POLL_MS = 8000

export default function WaitingRoom() {
  const [checking, setChecking] = useState(false)

  async function refreshToken() {
    try {
      setChecking(true)
      await auth.currentUser?.getIdToken(true)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    const id = setInterval(() => {
      auth.currentUser?.getIdToken(true).catch(() => {})
    }, POLL_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="waiting-room">
      <div className="waiting-room-card">
        <div className="waiting-room-icon">⏳</div>
        <h1 className="waiting-room-title">Waiting for Access</h1>
        <p className="waiting-room-body">
          Your account is pending approval. You'll be let in automatically once an admin assigns your role.
        </p>
        <div className="waiting-room-status">
          <span className="wr-dot wr-dot--waiting" />
          <span className="waiting-room-status-label">
            {checking ? "Checking…" : "Waiting for approval"}
          </span>
        </div>
        <button className="waiting-room-refresh-btn" onClick={refreshToken} disabled={checking}>
          Check again
        </button>
        <button
          className="waiting-room-refresh-btn"
          style={{ marginTop: "0.5rem" }}
          onClick={() => auth.signOut()}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
