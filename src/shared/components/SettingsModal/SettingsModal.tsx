import { useState, useEffect, useCallback } from "react"
import { X, Sun, Moon, Database } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "../../../core/auth/AuthProvider"
import { fetchSqlStatus, connectSql, disconnectSql } from "../../api/sqlApi"
import useLocalStorage from "../../hooks/useLocalStorage"
import { HASHED_RELATION_COLORS_KEY } from "../../hooks/useHashedRelationColors"
import { useModalLayer } from "../../hooks/useModalLayer"

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  theme: "light" | "dark"
  onThemeChange: (theme: "light" | "dark") => void
}

export function SettingsModal({ open, onClose, theme, onThemeChange }: SettingsModalProps) {
  const { claims } = useAuth()
  const isAdmin = claims["role"] === "executive"

  const [marginColorsEnabled, setMarginColorsEnabled] = useLocalStorage("marginColorsEnabled", true)
  const [hashedRelationColors, setHashedRelationColors] = useLocalStorage(HASHED_RELATION_COLORS_KEY, false)
  const [sqlConnected, setSqlConnected] = useState<boolean | null>(null)
  const [sqlLoading, setSqlLoading] = useState(false)
  const { overlayZ, contentZ } = useModalLayer(open)

  // Fetch SQL status when modal opens (admin only)
  useEffect(() => {
    if (open && isAdmin) {
      setSqlConnected(null)
      fetchSqlStatus()
        .then(setSqlConnected)
        .catch(() => setSqlConnected(null))
    }
  }, [open, isAdmin])

  const handleSqlToggle = useCallback(async () => {
    if (sqlConnected === null || sqlLoading) return
    setSqlLoading(true)
    try {
      if (sqlConnected) {
        await disconnectSql()
        setSqlConnected(false)
      } else {
        await connectSql()
        setSqlConnected(true)
      }
    } catch {
      // Failed — re-fetch actual status
      fetchSqlStatus().then(setSqlConnected).catch(() => {})
    } finally {
      setSqlLoading(false)
    }
  }, [sqlConnected, sqlLoading])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="modal-overlay"
            style={{ zIndex: overlayZ }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="modal-positioner" style={{ zIndex: contentZ }}>
            <motion.div
              className="modal settings-modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="modal-header">
                <h2 className="title2 emphasized">Settings</h2>
                <button className="button modal-close" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>

              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-row-label">Appearance</span>
                    <span className="settings-row-description">Switch between light and dark mode</span>
                    <span className="settings-row-shortcut"><kbd className="settings-kbd">⌘</kbd> <kbd className="settings-kbd">/</kbd></span>
                  </div>
                  <button
                    className="settings-toggle"
                    onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
                  >
                    {theme === "light" ? <Sun size={16} /> : <Moon size={16} />}
                    <span>{theme === "light" ? "Light" : "Dark"}</span>
                  </button>
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-row-label">Margin Colors</span>
                    <span className="settings-row-description">Color margin values green / amber / red by health</span>
                  </div>
                  <button
                    className={`settings-sql-toggle ${marginColorsEnabled ? "settings-sql-connected" : "settings-sql-disconnected"}`}
                    onClick={() => setMarginColorsEnabled(!marginColorsEnabled)}
                  >
                    {marginColorsEnabled ? "On" : "Off"}
                  </button>
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-row-label">Randomize Relation Colors</span>
                    <span className="settings-row-description">Give each client, subcontractor and supplier its own consistent color instead of shades of one hue</span>
                  </div>
                  <button
                    className={`settings-sql-toggle ${hashedRelationColors ? "settings-sql-connected" : "settings-sql-disconnected"}`}
                    onClick={() => setHashedRelationColors(!hashedRelationColors)}
                  >
                    {hashedRelationColors ? "On" : "Off"}
                  </button>
                </div>
              </div>

              {isAdmin && (
                <div className="settings-section">
                  <div className="settings-section-header">
                    <span className="settings-section-title headline">Administration</span>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <span className="settings-row-label">
                        <Database size={15} />
                        Data Source Connection
                      </span>
                      <span className="settings-row-description">
                        {sqlConnected
                          ? "Click to disconnect the dashboard server from SAGE"
                          : "Click to reconnect the dashboard server to SAGE"}
                      </span>
                    </div>
                    <button
                      className={`settings-sql-toggle ${sqlConnected ? "settings-sql-connected" : "settings-sql-disconnected"}`}
                      onClick={handleSqlToggle}
                      disabled={sqlConnected === null || sqlLoading}
                    >
                      {sqlLoading ? (
                        "..."
                      ) : sqlConnected === null ? (
                        "Checking..."
                      ) : sqlConnected ? (
                        "Connected"
                      ) : (
                        "Disconnected"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
