import Logo from "./Logo"

// Full-viewport resting state for the two moments the app has nothing to
// paint yet: the auth boot gate (App's `loading`) and a cold deep-link into a
// lazy route chunk (the Suspense fallback around App's <Outlet/>). In-app
// navigations never show this — the persistent Suspense boundary keeps the
// previous page up while the next chunk loads — so it only appears when a
// blank screen is the alternative.
export default function LoadingScreen() {
  return (
    <div className="loading-screen" aria-label="Loading" role="status">
      <div className="loading-screen-bg" />
      <div className="loading-screen-logo">
        <Logo size={48} />
      </div>
    </div>
  )
}
