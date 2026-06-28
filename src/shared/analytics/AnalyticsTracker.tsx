import { useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"
import { initAnalytics, trackPageView } from "./analytics"

/**
 * Headless component mounted once inside the authenticated app shell. Boots the
 * analytics pipeline and records a page_view on every route change (deduped on
 * consecutive identical paths). Renders nothing.
 */
export default function AnalyticsTracker() {
  const { pathname } = useLocation()
  const lastPath = useRef<string | null>(null)

  useEffect(() => { initAnalytics() }, [])

  useEffect(() => {
    if (lastPath.current === pathname) return
    lastPath.current = pathname
    trackPageView(pathname)
  }, [pathname])

  return null
}
