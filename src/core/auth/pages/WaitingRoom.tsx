import { useEffect, useRef, useState } from "react"
import { useAuth } from "../AuthProvider"
import { auth } from "../firebase"

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api"

export default function WaitingRoom() {
  const { user } = useAuth()
  const [status, setStatus] = useState<"connecting" | "waiting" | "admitted">("connecting")
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    let closed = false
    let es: EventSource | null = null

    async function connect() {
      const token = await auth.currentUser?.getIdToken()
      if (!token || closed) return

      es = new EventSource(`${API_BASE_URL}/users/sse?token=${encodeURIComponent(token)}`)
      esRef.current = es

      es.onopen = () => setStatus("waiting")

      es.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; role?: string }
          if (msg.type === "roleAssigned") {
            setStatus("admitted")
            es?.close()
            esRef.current = null
            // Force-refresh the ID token so AuthProvider picks up new claims
            await auth.currentUser?.getIdToken(true)
          }
        } catch {
          // ignore
        }
      }

      es.onerror = () => {
        setStatus("waiting")
        es?.close()
        esRef.current = null
        if (!closed) setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      closed = true
      es?.close()
      esRef.current = null
    }
  }, [user])

  async function handleRefresh() {
    if (user) {
      await user.getIdToken(true)
    }
  }

  return (
    <div className="waiting-room">
      <div className="waiting-room-card">
        <div className="waiting-room-icon">⏳</div>
        <h1 className="waiting-room-title">Waiting for Access</h1>
        <p className="waiting-room-body">
          Your account is pending approval. You'll be let in automatically once an admin assigns your role.
        </p>
        <div className="waiting-room-status">
          {status === "connecting" && <span className="wr-dot wr-dot--connecting" />}
          {status === "waiting" && <span className="wr-dot wr-dot--waiting" />}
          {status === "admitted" && <span className="wr-dot wr-dot--admitted" />}
          <span className="waiting-room-status-label">
            {status === "connecting" && "Connecting…"}
            {status === "waiting" && "Waiting for approval"}
            {status === "admitted" && "Access granted — loading…"}
          </span>
        </div>
        <button className="waiting-room-refresh-btn" onClick={handleRefresh}>
          Refresh manually
        </button>
      </div>
    </div>
  )
}
