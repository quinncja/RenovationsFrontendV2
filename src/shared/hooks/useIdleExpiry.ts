import { useEffect, useRef, useState } from "react"

/**
 * Trips `true` once the user has been inactive for `limitMs`, and stays tripped
 * until the page reloads — by design, the only way out is a refresh (which gives
 * analytics a fresh per-load sessionId, so an idle-then-resumed visit counts as a
 * new session).
 *
 * Robust to laptop sleep / backgrounded tabs: rather than trusting a single long
 * setTimeout (which browsers throttle or defer while hidden), we stamp the last
 * activity time and re-check elapsed wall-clock on an interval and whenever the
 * tab becomes visible again.
 */
export const IDLE_LIMIT_MS = 2 * 60 * 60 * 1000 // 2 hours

const CHECK_INTERVAL_MS = 30_000
const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "scroll",
  "wheel",
  "touchstart",
  "mousemove",
] as const

export default function useIdleExpiry(limitMs: number = IDLE_LIMIT_MS) {
  const [expired, setExpired] = useState(false)
  const lastActivity = useRef(Date.now())

  useEffect(() => {
    // Once expired we tear everything down — further activity must not revive a
    // stale page; the user has to refresh.
    if (expired) return

    const bump = () => {
      lastActivity.current = Date.now()
    }
    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, bump, { passive: true }),
    )

    const check = () => {
      if (Date.now() - lastActivity.current >= limitMs) setExpired(true)
    }
    const interval = setInterval(check, CHECK_INTERVAL_MS)

    const onVisibility = () => {
      if (document.visibilityState === "visible") check()
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, bump))
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [expired, limitMs])

  return expired
}
