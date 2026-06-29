import useIdleExpiry from "../../shared/hooks/useIdleExpiry"
import Logo from "./Logo"

/**
 * Headless until the user has been idle past the limit, then takes over the
 * screen with a calm prompt to refresh. Mounted once in the authenticated app
 * shell. A refresh is the only way forward, which also rotates the analytics
 * sessionId — so a resumed visit is recorded as a new session.
 */
export default function IdleRefreshOverlay() {
  const expired = useIdleExpiry()

  // Dev-only escape hatch: `?idle` force-renders the overlay so it can be
  // previewed without waiting out the 2h idle timer. Stripped from production
  // builds (import.meta.env.DEV → false).
  const previewIdle =
    import.meta.env.DEV && new URLSearchParams(window.location.search).has("idle")

  if (!expired && !previewIdle) return null

  return (
    <div
      className="idle-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-overlay-title"
    >
      <div className="idle-overlay-card">
        <Logo size={40} />
        <h2 id="idle-overlay-title" className="idle-overlay-title">
          Session paused
        </h2>
        <p className="idle-overlay-body">
          You've been inactive for a while. Refresh to load the latest data.
        </p>
        <button
          className="idle-overlay-btn"
          onClick={() => window.location.reload()}
          autoFocus
        >
          Refresh
        </button>
      </div>
    </div>
  )
}
