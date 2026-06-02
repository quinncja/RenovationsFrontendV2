import { useEffect, useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X, Settings } from "lucide-react"
import useNavItems from "../auth/hooks/useNavItems"
import { isNavGroup, isNavDivider } from "../auth/roles"
import { SettingsModal } from "../../shared/components/SettingsModal/SettingsModal"
import useLocalStorage from "../../shared/hooks/useLocalStorage"

interface MobileMenuDrawerProps {
  open: boolean
  onClose: () => void
}

export default function MobileMenuDrawer({ open, onClose }: MobileMenuDrawerProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const navItems = useNavItems()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme, setTheme] = useLocalStorage<"light" | "dark">("theme", "light")

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
      return () => { document.body.style.overflow = "" }
    }
  }, [open])

  function handleNav(path: string) {
    navigate(path)
    onClose()
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.nav
              className="mobile-menu-drawer"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
            >
              <div className="mobile-menu-header">
                <span className="title2 emphasized">Menu</span>
                <button className="button modal-close" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>

              <div className="mobile-menu-items">
                {navItems.map((item, i) => {
                  if (isNavDivider(item)) {
                    return <div key={`divider-${i}`} className="mobile-menu-divider" role="separator" />
                  }
                  if (isNavGroup(item)) {
                    return (
                      <div key={item.label} className="mobile-menu-group">
                        <span className="mobile-menu-group-label headline">{item.label}</span>
                        {item.items.map((child) => (
                          <button
                            key={child.path}
                            className={`mobile-menu-item${location.pathname.startsWith(child.path) ? " mobile-menu-item-active" : ""}`}
                            onClick={() => handleNav(child.path)}
                          >
                            <child.icon size={20} />
                            <span>{child.label}</span>
                          </button>
                        ))}
                      </div>
                    )
                  }

                  return (
                    <button
                      key={item.path}
                      className={`mobile-menu-item${location.pathname.startsWith(item.path) ? " mobile-menu-item-active" : ""}`}
                      onClick={() => handleNav(item.path)}
                    >
                      <item.icon size={20} />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>

              <div className="mobile-menu-footer">
                <button
                  className="mobile-menu-item"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings size={20} />
                  <span>Settings</span>
                </button>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
      />
    </>
  )
}
