import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate, useLocation } from "react-router-dom"
import { Settings, ChevronsRight, ChevronsLeft, ChevronRight } from "lucide-react"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import useNavItems from "../auth/hooks/useNavItems"
import { isNavGroup, isNavDivider, type NavGroup } from "../auth/roles"
import { SettingsModal } from "../../shared/components/SettingsModal/SettingsModal"
import { useDailyReport } from "../../modules/dashboard/report/DailyReportContext"
import { NavReportsHint } from "../../modules/dashboard/report/NavReportsHint"
import { registerCoachTarget } from "../onboarding/coachTargets"
import { useOnboarding } from "../onboarding/OnboardingProvider"
import { SECTION_OVERHEAD_REPORT } from "../onboarding/markers"
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
      className={`button nav-button nav-group-header${active ? " nav-button-active" : ""}${attention ? " nav-button-attention" : ""}`}
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
  const navItems = useNavItems()
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Intro coachmark for the Reports nav item (step 2; see DailyReportContext).
  const { introStep } = useDailyReport()
  // Exposes the Job Cost nav button to the onboarding host (coachTargets.ts)
  // without document.querySelector; only attached to that one leaf item below.
  const jobcostRef = useCallback((el: HTMLButtonElement | null) => {
    registerCoachTarget("nav-jobcost", el)
  }, [])
  const financesRef = useCallback((el: HTMLButtonElement | null) => {
    registerCoachTarget("nav-finances", el)
  }, [])

  // Overhead Expense Report announcement — an incremental milestone (§4.5) on
  // the Finances group, for established users only (phase gates it off during
  // setup; introStep off during the intro coachmarks; veil off during the admin
  // tour). `?overhead-hint` previews without stamping the milestone, mirroring
  // `?arrival` / `?tour`.
  const { phase, resolving, seen, acknowledge } = useOnboarding()
  const [overheadHintPreview] = useState(
    () => new URLSearchParams(window.location.search).has("overhead-hint")
  )
  const [previewDismissed, setPreviewDismissed] = useState(false)
  const hasFinancesGroup = navItems.some((item) => isNavGroup(item) && item.label === "Finances")
  const overheadHintOn = overheadHintPreview
    ? !previewDismissed && hasFinancesGroup
    : hasFinancesGroup &&
      veil === "off" &&
      introStep === 0 &&
      phase === "onboarded" &&
      !resolving &&
      !seen(SECTION_OVERHEAD_REPORT)
  const dismissOverheadHint = useCallback(() => {
    if (overheadHintPreview) setPreviewDismissed(true)
    else acknowledge(SECTION_OVERHEAD_REPORT)
  }, [overheadHintPreview, acknowledge])

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
      <div className={`navbar ${isOpen ? "navbar-open" : ""}${veil !== "off" ? " navbar--tour" : ""}${veil === "veiled" ? " navbar--veiled" : ""}`}>
        <div className="logo-wrapper" onClick={() => navigate("/dashboard", { state: { resetHome: true } })}>
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
                attention={item.label === "Finances" && overheadHintOn}
                buttonRef={item.label === "Finances" ? financesRef : undefined}
                onOpenFlyout={openFlyout}
                onScheduleClose={scheduleClose}
              />
            ) : (
              <button
                key={item.path}
                ref={item.path === "/jobcost" ? jobcostRef : undefined}
                data-nav={item.path}
                className={`button nav-button${location.pathname === item.path || location.pathname.startsWith(`${item.path}/`) ? " nav-button-active" : ""}${introStep === 2 && item.path === "/reports" ? " nav-button-attention" : ""}`}
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

      <NavReportsHint />

      <NavSectionHint
        targetId="nav-finances"
        active={overheadHintOn}
        veiled={flyout != null}
        title="New in Finances"
        body="Overhead Expense Report now available."
        onDismiss={dismissOverheadHint}
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
