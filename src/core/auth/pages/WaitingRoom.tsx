import { useEffect, useRef, useState } from "react"
import { useAuth } from "../AuthProvider"
import { auth } from "../firebase"
import Logo from "../../components/Logo"

// Trim trailing slash so `${API_BASE_URL}/users/...` never produces "//".
const API_BASE_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "")

type Status = "connecting" | "waiting" | "admitted" | "rejected"

export default function WaitingRoom() {
  const { user } = useAuth()
  const [status, setStatus] = useState<Status>("connecting")
  const esRef = useRef<EventSource | null>(null)

  // Announce this user's presence so admins see them in the waiting room.
  // Small delay to ensure Firebase has propagated the new user.
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) return
        await fetch(`${API_BASE_URL}/users/announce`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      } catch {
        // non-critical
      }
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

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
          } else if (msg.type === "rejected") {
            setStatus("rejected")
            es?.close()
            esRef.current = null
            await auth.signOut()
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

  // The middle step is the live one until a role is assigned.
  const reviewState =
    status === "admitted" ? "done" : status === "rejected" ? "error" : "active"
  const accessState = status === "admitted" ? "active" : "pending"

  return (
    <div className="login-page">
      <div className="login-background" />
      <div className="auth-card wr-card">
        <div className="auth-card-header">
          <Logo size={44} />
          <h1 className="title1">
            {status === "rejected" ? "Access not granted" : "Almost there"}
          </h1>
          <p className="body-text">
            {status === "rejected"
              ? "An administrator declined this request. Reach out to your team if you think this is a mistake."
              : "Your account is in. We just need an administrator to set your role before the dashboard opens up."}
          </p>
        </div>

        {status !== "rejected" && (
          <ol className="wr-steps" aria-label="Access progress">
            <Step state="done" title="Signed in" detail={user?.email ?? undefined} />
            <Step
              state={reviewState as StepState}
              title="Awaiting approval"
              detail={
                status === "connecting"
                  ? "Reaching the server…"
                  : status === "admitted"
                    ? "Role assigned"
                    : "An admin has been notified"
              }
            />
            <Step
              state={accessState as StepState}
              title="Dashboard access"
              detail={status === "admitted" ? "Loading your workspace…" : undefined}
            />
          </ol>
        )}

        {status !== "admitted" && status !== "rejected" && (
          <button className="wr-refresh" onClick={handleRefresh}>
            Check again
          </button>
        )}
      </div>
    </div>
  )
}

type StepState = "done" | "active" | "pending" | "error"

function Step({
  state,
  title,
  detail,
}: {
  state: StepState
  title: string
  detail?: string
}) {
  return (
    <li className={`wr-step wr-step--${state}`}>
      <span className="wr-step-marker" aria-hidden="true">
        {state === "done" && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6.2 5 8.7l4.5-5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {state === "active" && <span className="wr-step-ping" />}
      </span>
      <span className="wr-step-text">
        <span className="wr-step-title">{title}</span>
        {detail && <span className="wr-step-detail">{detail}</span>}
      </span>
    </li>
  )
}
