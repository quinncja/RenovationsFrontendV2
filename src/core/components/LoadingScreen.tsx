import Logo from "./Logo"

// Keep in sync with the loading-logo-pulse duration in App.css.
const PULSE_MS = 2000

// Full-viewport resting state for the two moments the app has nothing to
// paint yet: the auth boot gate (App's `loading`) and a cold deep-link into a
// lazy route chunk (the Suspense fallback around App's <Outlet/>). In-app
// navigations never show this — the persistent Suspense boundary keeps the
// previous page up while the next chunk loads — so it only appears when a
// blank screen is the alternative.
//
// Boot renders SEVERAL of these back to back (auth gate → chunk fallback →
// arrival-gate release), so the pulse is phase-locked to a shared clock: the
// negative delay is the page's elapsed time modulo the cycle, and every
// instance joins the SAME pulse mid-stride instead of restarting its fade at
// each remount — the restarts read as the logo flickering.
export default function LoadingScreen() {
  return (
    <div className="loading-screen" aria-label="Loading" role="status">
      <div className="loading-screen-bg" />
      <div
        className="loading-screen-logo"
        style={{ animationDelay: `-${performance.now() % PULSE_MS}ms` }}
      >
        <Logo size={48} />
      </div>
    </div>
  )
}
