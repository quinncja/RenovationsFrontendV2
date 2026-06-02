import { useEffect, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { useNavigate, useLocation } from "react-router-dom"
import { Settings, ChevronsRight, ChevronsLeft, ChevronDown } from "lucide-react"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import useNavItems from "../auth/hooks/useNavItems"
import { isNavGroup, isNavDivider, type NavItem, type NavGroup } from "../auth/roles"
import { SettingsModal } from "../../shared/components/SettingsModal/SettingsModal"
import Logo from "./Logo"
import LogoText from "./LogoText"

type TooltipState = { label: string; y: number } | null

function NavGroupItem({
  group,
  isOpen: sidebarOpen,
  expanded,
  onToggle,
  onTooltip,
}: {
  group: NavGroup
  isOpen: boolean
  expanded: boolean
  onToggle: () => void
  onTooltip: (state: TooltipState) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const isAnyChildActive = group.items.some(item => location.pathname.startsWith(item.path))

  const tip = useCallback((label: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!sidebarOpen) {
      const r = e.currentTarget.getBoundingClientRect()
      onTooltip({ label, y: r.top + r.height / 2 })
    }
  }, [sidebarOpen, onTooltip])

  return (
    <div className={`nav-group${expanded ? " nav-group-open" : ""}${isAnyChildActive ? " nav-group-child-active" : ""}`}>
      <button
        className={`button nav-button nav-group-header${isAnyChildActive ? " nav-group-header-active" : ""}`}
        onClick={onToggle}
        onMouseEnter={tip(group.label)}
        onMouseLeave={() => onTooltip(null)}
      >
        <group.icon size={20} />
        <span className="nav-button-label">{group.label}</span>
        {sidebarOpen && (
          <ChevronDown
            size={14}
            className={`nav-group-chevron${expanded ? " nav-group-chevron-open" : ""}`}
          />
        )}
      </button>
      <div className={`nav-group-items${expanded ? " nav-group-items-open" : ""}`}>
        <div className="nav-group-items-inner">
          {group.items.map((item: NavItem) => (
            <button
              key={item.path}
              className={`button nav-button${location.pathname.startsWith(item.path) ? " nav-button-active" : ""}`}
              onClick={() => navigate(item.path)}
              onMouseEnter={tip(item.label)}
              onMouseLeave={() => onTooltip(null)}
            >
              <item.icon size={20} />
              <span className="nav-button-label">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [isOpen, setIsOpen] = useLocalStorage("navbarOpen", true)
  const [theme, setTheme] = useLocalStorage<"light" | "dark">("theme", "dark")
  const navItems = useNavItems()
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    const active = navItems.find(
      item => isNavGroup(item) && item.items.some(child => location.pathname.startsWith(child.path))
    )
    return active && isNavGroup(active) ? active.label : null
  })

  // Clear tooltip when sidebar opens
  useEffect(() => { if (isOpen) setTooltip(null) }, [isOpen])

  // Auto-open the group containing the active child route
  useEffect(() => {
    const active = navItems.find(
      item => isNavGroup(item) && item.items.some(child => location.pathname.startsWith(child.path))
    )
    if (active && isNavGroup(active)) setOpenGroup(active.label)
  }, [location.pathname])

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
      <div className={`navbar ${isOpen ? "navbar-open" : ""}`}>
        <div className="logo-wrapper" onClick={() => navigate("/dashboard")}>
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
                expanded={openGroup === item.label}
                onToggle={() => setOpenGroup(openGroup === item.label ? null : item.label)}
                onTooltip={setTooltip}
              />
            ) : (
              <button
                key={item.path}
                className={`button nav-button${location.pathname === item.path || location.pathname.startsWith(`${item.path}/`) ? " nav-button-active" : ""}`}
                onClick={() => { navigate(item.path); setOpenGroup(null) }}
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
