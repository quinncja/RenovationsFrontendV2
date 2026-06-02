import { useState, useMemo } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Home, Building, Menu, type LucideIcon } from "lucide-react"
import useNavItems from "../auth/hooks/useNavItems"
import { isNavGroup, isNavDivider } from "../auth/roles"
import MobileMenuDrawer from "./MobileMenuDrawer"

const PINNED_PATHS = ["/dashboard", "/jobcosting"]

export default function MobileNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const navItems = useNavItems()
  const [menuOpen, setMenuOpen] = useState(false)

  // Find the icon for the current route if it's not a pinned route
  const menuIcon = useMemo((): LucideIcon => {
    const path = location.pathname
    if (PINNED_PATHS.some((p) => path.startsWith(p))) return Menu

    for (const item of navItems) {
      if (isNavDivider(item)) continue
      if (isNavGroup(item)) {
        for (const child of item.items) {
          if (path.startsWith(child.path)) return child.icon
        }
      } else {
        if (path.startsWith(item.path)) return item.icon
      }
    }

    return Menu
  }, [location.pathname, navItems])

  const MenuIcon = menuIcon
  const isOnHome = location.pathname === "/dashboard"
  const isOnProjects = location.pathname.startsWith("/jobcosting")
  const isOnOther = !isOnHome && !isOnProjects

  return (
    <>
      <nav className="mobile-nav">
        <button
          className={`mobile-nav-button${isOnHome ? " mobile-nav-button-active" : ""}`}
          onClick={() => navigate("/dashboard")}
        >
          <Home size={22} />
          <span>Home</span>
        </button>
        <button
          className={`mobile-nav-button${isOnProjects ? " mobile-nav-button-active" : ""}`}
          onClick={() => navigate("/jobcosting")}
        >
          <Building size={22} />
          <span>Projects</span>
        </button>
        <button
          className={`mobile-nav-button${menuOpen || isOnOther ? " mobile-nav-button-active" : ""}`}
          onClick={() => setMenuOpen(true)}
        >
          <MenuIcon size={22} />
          <span>Menu</span>
        </button>
      </nav>

      <MobileMenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  )
}
