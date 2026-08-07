import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate, useLocation } from "react-router-dom"
import { Settings, ChevronsRight, ChevronsLeft, ChevronRight, Users } from "lucide-react"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import useNavItems from "../auth/hooks/useNavItems"
import { isNavGroup, isNavDivider, type NavGroup, type NavItem } from "../auth/roles"
import { SettingsModal } from "../../shared/components/SettingsModal/SettingsModal"
import { useDailyReport } from "../../modules/dashboard/report/DailyReportContext"
import { registerCoachTarget } from "../onboarding/coachTargets"
import { useOnboarding } from "../onboarding/OnboardingProvider"
import { SECTION_ANNOUNCEMENTS } from "../onboarding/sectionAnnouncements"
import { NavSectionHint } from "../onboarding/NavSectionHint"
import type { NavbarVeil } from "../../modules/dashboard/onboarding/AdminOnboarding"
import Logo from "./Logo"
import LogoText from "./LogoText"

type TooltipState = { label: string; y: number } | null
type FlyoutState = { group: NavGroup; top: number; left: number } | null

function NavGroupItem({
  group,
  isOpen: sidebarOpen,
  active,
  attention,
  buttonRef,
  onOpenFlyout,
  onScheduleClose,
}: {
  group: NavGroup
  isOpen: boolean
  active: boolean
  /** Pulse ring while a new-section hint points at this group. */
  attention?: boolean
  buttonRef?: (el: HTMLButtonElement | null) => void
  onOpenFlyout: (group: NavGroup, anchor: DOMRect) => void
  onScheduleClose: () => void
}) {
  const open = (e: React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>) =>
    onOpenFlyout(group, e.currentTarget.getBoundingClientRect())

  return (
    <button
      ref={buttonRef}
      className={`button nav-button nav-group-header${active ? " nav-button-active" : ""}${attention ? " nav-button-attention nav-button-attention--announce" : ""}`}
      onMouseEnter={open}
      onMouseLeave={onScheduleClose}
      onFocus={open}
      onBlur={onScheduleClose}
      onClick={open}
      aria-haspopup="menu"
    >
      <group.icon size={20} />
      <span className="nav-button-label">{group.label}</span>
      {sidebarOpen && <ChevronRight size={14} className="nav-group-chevron" />}
    </button>
  )
}

function Navbar({ veil = "off" }: { veil?: NavbarVeil }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isOpen, setIsOpen] = useLocalStorage("navbarOpen", true)
  const [theme, setTheme] = useLocalStorage<"light" | "dark">("theme", "light")
  const allNavItems = useNavItems()
  // Users moved out of the main nav list: it renders as a small white button
  // pinned above Settings in navbar-bottom. Role-gating stays in roles.ts —
  // if the role's nav has no /users entry, the button simply doesn't exist.
  const hasUsers = allNavItems.some((it) => !isNavGroup(it) && !isNavDivider(it) && it.path === "/users")
  const navItems = allNavItems.filter((it) => isNavGroup(it) || isNavDivider(it) || it.path !== "/users")
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Intro coachmark for the Reports nav item (step 2; see DailyReportContext).
  const { introStep, advanceIntro } = useDailyReport()
  // Exposes the Job Cost nav button to the onboarding host (coachTargets.ts)
  // without document.querySelector; only attached to that one leaf item below.
  const jobcostRef = useCallback((el: HTMLButtonElement | null) => {
    registerCoachTarget("nav-jobcost", el)
  }, [])
  // Same for the Reports nav button — the intro's second coachmark (see
  // NavSectionHint usage below) used to find it via document.querySelector.
  const reportsRef = useCallback((el: HTMLButtonElement | null) => {
    registerCoachTarget("nav-reports", el)
  }, [])
  // Stable per-group callback refs for announcement coach targets. Leaf-item
  // (navPath) announcements reuse an already-registered target (e.g.
  // nav-jobcost above), so only group anchors register here.
  const announcementRefs = useMemo(() => {
    const refs = new Map<string, (el: HTMLButtonElement | null) => void>()
    for (const a of SECTION_ANNOUNCEMENTS) {
      if (a.navGroup && !refs.has(a.navGroup)) refs.set(a.navGroup, (el) => registerCoachTarget(a.targetId, el))
    }
    return refs
  }, [])

  // Section announcements — incremental milestones (§4.5) shown to established
  // users only (phase gates them off during setup; introStep off during the
  // intro coachmarks; veil off during the admin tour). Of all unseen
  // announcements the user's nav can show, only the NEWEST renders; a
  // `?<previewParam>` previews its entry without stamping.
  const { phase, resolving, seen, acknowledge } = useOnboarding()
  const [previewAnnouncement] = useState(() => {
    if (!import.meta.env.DEV) return null
    const params = new URLSearchParams(window.location.search)
    return SECTION_ANNOUNCEMENTS.filter((a) => params.has(a.previewParam)).at(-1) ?? null
  })
  const [previewDismissed, setPreviewDismissed] = useState(false)
  const eligible = veil === "off" && introStep === 0 && phase === "onboarded" && !resolving
  const navGroupLabels = new Set(navItems.filter(isNavGroup).map((g) => g.label))
  const navPaths = new Set(
    navItems.filter((it): it is NavItem => !isNavGroup(it) && !isNavDivider(it)).map((it) => it.path),
  )
  const announcement = previewAnnouncement
    ? previewDismissed
      ? null
      : previewAnnouncement
    : (eligible
        ? SECTION_ANNOUNCEMENTS.filter(
            (a) =>
              (a.navGroup ? navGroupLabels.has(a.navGroup) : a.navPath != null && navPaths.has(a.navPath)) &&
              !seen(a.milestone) &&
              // Not eligible yet ≠ superseded: an unmet requiresSeen keeps the
              // older hint showing without retiring it.
              (!a.requiresSeen || seen(a.requiresSeen)),
          )
        : []
      ).at(-1) ?? null

  // Retire superseded announcements: while a newer one is showing, silently
  // acknowledge every older unseen entry so a user who missed several releases
  // is caught up by one hint instead of a queue of stale ones. (Runs regardless
  // of the older entry's nav group — a role that never had the group shouldn't
  // be nagged about it after a role change either.)
  useEffect(() => {
    if (!announcement || previewAnnouncement) return
    const shownIdx = SECTION_ANNOUNCEMENTS.findIndex((a) => a.milestone === announcement.milestone)
    for (const stale of SECTION_ANNOUNCEMENTS.slice(0, shownIdx)) {
      if (!seen(stale.milestone)) acknowledge(stale.milestone)
    }
  }, [announcement, previewAnnouncement, seen, acknowledge])

  const dismissAnnouncement = useCallback(() => {
    if (previewAnnouncement) setPreviewDismissed(true)
    else if (announcement) acknowledge(announcement.milestone)
  }, [previewAnnouncement, announcement, acknowledge])

  // Flyout panel for nav groups: hover/click a group → its children float out to
  // the right, anchored to the group row. Works the same open or collapsed.
  const [flyout, setFlyout] = useState<FlyoutState>(null)
  const closeTimer = useRef<number | undefined>(undefined)

  const cancelClose = () => {
    if (closeTimer.current !== undefined) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = undefined
    }
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setFlyout(null), 140)
  }
  const openFlyout = (group: NavGroup, anchor: DOMRect) => {
    cancelClose()
    setTooltip(null)
    setFlyout({ group, top: anchor.top, left: anchor.right })
  }

  useEffect(() => () => cancelClose(), [])

  // Clear transient overlays when the sidebar toggles.
  useEffect(() => { if (isOpen) setTooltip(null) }, [isOpen])

  useEffect(() => {
    document.documentElement.style.colorScheme = theme
  }, [theme])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === ".") {
        e.preventDefault()
        setIsOpen(!isOpen)
      }
      if (e.metaKey && e.key === "/") {
        e.preventDefault()
        setTheme(theme === "dark" ? "light" : "dark")
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, setIsOpen, theme, setTheme])

  function tipProps(label: string) {
    return {
      onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
        if (!isOpen) {
          const r = e.currentTarget.getBoundingClientRect()
          setTooltip({ label, y: r.top + r.height / 2 })
        }
      },
      onMouseLeave: () => setTooltip(null),
    }
  }

  return (
    <>
      <div
        // Measured (never spotlighted) by content-area overlays — see the
        // "navbar" coach-target id.
        ref={(el) => registerCoachTarget("navbar", el)}
        className={`navbar ${isOpen ? "navbar-open" : ""}${veil !== "off" ? " navbar--tour" : ""}${veil === "veiled" ? " navbar--veiled" : ""}`}
      >
        <div
          className="logo-wrapper"
          onClick={() => navigate("/dashboard", { state: { resetHome: true } })}
          role="button"
          tabIndex={0}
          aria-label="Go to dashboard"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              navigate("/dashboard", { state: { resetHome: true } })
            }
          }}
        >
          <div className="logo-icon">
            <Logo size={32} />
          </div>
          {isOpen && <LogoText />}
        </div>
        <div className="navbar-top">
          {navItems.map((item, i) =>
            isNavDivider(item) ? (
              <div key={`divider-${i}`} className="nav-divider" role="separator" />
            ) : isNavGroup(item) ? (
              <NavGroupItem
                key={item.label}
                group={item}
                isOpen={isOpen}
                active={item.items.some(child => location.pathname.startsWith(child.path))}
                attention={announcement?.navGroup === item.label}
                buttonRef={announcementRefs.get(item.label)}
                onOpenFlyout={openFlyout}
                onScheduleClose={scheduleClose}
              />
            ) : (
              <button
                key={item.path}
                ref={item.path === "/jobcost" ? jobcostRef : item.path === "/reports" ? reportsRef : undefined}
                data-nav={item.path}
                className={`button nav-button${location.pathname === item.path || location.pathname.startsWith(`${item.path}/`) ? " nav-button-active" : ""}${(introStep === 2 && item.path === "/reports") || announcement?.navPath === item.path ? " nav-button-attention" : ""}`}
                onClick={() => {
                  // Home button → reset the section pager to the top; other routes navigate as-is.
                  navigate(item.path, item.path === "/dashboard" ? { state: { resetHome: true } } : {})
                  setFlyout(null)
                }}
                {...tipProps(item.label)}
              >
                <item.icon size={20} />
                <span className="nav-button-label">{item.label}</span>
              </button>
            )
          )}
        </div>

        <div className="navbar-bottom">
          {hasUsers && (
            <button
              className={`button bottom-nav-button${location.pathname.startsWith("/users") ? " bottom-nav-button-active" : ""}`}
              title="Users"
              onClick={() => navigate("/users")}
            >
              <Users size={17} />
            </button>
          )}
          <button
            className="button bottom-nav-button"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={17} />
          </button>
          <button
            className="button bottom-nav-button"
            title={`${isOpen ? "Collapse" : "Expand"} sidebar (⌘.)`}
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <ChevronsLeft size={17} /> : <ChevronsRight size={17} />}
          </button>
        </div>
      </div>

      {tooltip && !isOpen && createPortal(
        <div className="nav-tooltip" style={{ top: tooltip.y, left: "4.625rem" }}>
          {tooltip.label}
        </div>,
        document.body
      )}

      {flyout && createPortal(
        <div
          className="nav-flyout"
          style={{ top: flyout.top, left: flyout.left }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="nav-flyout-card" role="menu">
            <div className="nav-flyout-title">{flyout.group.label}</div>
            {flyout.group.items.map(child => (
              <button
                key={child.path}
                className={`button nav-flyout-item${location.pathname.startsWith(child.path) ? " nav-flyout-item-active" : ""}`}
                role="menuitem"
                onClick={() => {
                  navigate(child.path)
                  setFlyout(null)
                }}
              >
                <child.icon size={18} />
                <span className="nav-flyout-item-label">{child.label}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Intro coachmark step 2: teaches the Reports nav item. Was a
          standalone component (NavReportsHint) with its own
          document.querySelector-based positioning; now the same
          NavSectionHint every other nav popover uses. */}
      <NavSectionHint
        targetId="nav-reports"
        active={introStep === 2}
        title="Reports shortcut"
        body="To view activity reports from other time periods, click here."
        onDismiss={advanceIntro}
      />

      {/* Kept mounted with fallback props while inactive: AnimatePresence
          freezes the exiting card's content, so the fallbacks never paint. */}
      <NavSectionHint
        targetId={(announcement ?? SECTION_ANNOUNCEMENTS[SECTION_ANNOUNCEMENTS.length - 1]).targetId}
        active={announcement != null}
        veiled={flyout != null}
        title={announcement?.title ?? ""}
        body={announcement?.body ?? ""}
        onDismiss={dismissAnnouncement}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
      />
    </>
  )
}

export default Navbar
