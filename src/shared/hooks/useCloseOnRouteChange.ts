import { useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"

/**
 * Closes a modal when the route changes underneath it.
 *
 * Modals mounted above the routes (the daily recap stack lives in
 * DailyReportProvider) survive navigation: a drill-down's "View project" can
 * move the URL while every layer of the stack stays on screen over the new
 * page. Any modal whose `active` flag is up when `location.pathname` moves
 * gets its `onClose` called, so the whole stack dismisses in one commit —
 * each layer watches the same pathname change.
 *
 * Only the pathname is watched: search/hash changes (dev previews like
 * `?report`) don't count as leaving the page.
 */
export function useCloseOnRouteChange(active: boolean, onClose: () => void) {
  const { pathname } = useLocation()
  const prevPathname = useRef(pathname)
  // Callers pass inline closures; the ref keeps the effect off their identity.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (pathname === prevPathname.current) return
    prevPathname.current = pathname
    if (active) closeRef.current()
  }, [pathname, active])
}
