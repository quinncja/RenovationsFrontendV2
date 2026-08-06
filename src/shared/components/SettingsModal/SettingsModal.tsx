import { useState, useEffect, useCallback } from "react"
import { X, Sun, Moon, Database, LogOut } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { signOut } from "firebase/auth"
import { auth } from "../../../core/auth/firebase"
import { useAuth } from "../../../core/auth/AuthProvider"
import { fetchSqlStatus, connectSql, disconnectSql } from "../../api/sqlApi"
import useLocalStorage from "../../hooks/useLocalStorage"
import { HASHED_RELATION_COLORS_KEY } from "../../hooks/useHashedRelationColors"
import useJobcostDefaultRange, { JOBCOST_DEFAULT_RANGE_OPTIONS } from "../../hooks/useJobcostDefaultRange"
import { useModalLayer } from "../../hooks/useModalLayer"
import { SegmentedControl } from "../SegmentedControl"

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  theme: "light" | "dark"
  onThemeChange: (theme: "light" | "dark") => void
}

const ON_OFF = [
  { key: "on", label: "On" },
  { key: "off", label: "Off" },
] as const

export function SettingsModal({ open, onClose, theme, onThemeChange }: SettingsModalProps) {
  const { user, claims } = useAuth()
  const isAdmin = claims["role"] === "executive"

  const handleSignOut = useCallback(async () => {
    onClose()
    await signOut(auth)
  }, [onClose])

  const [marginColorsEnabled, setMarginColorsEnabled] = useLocalStorage("marginColorsEnabled", true)
  const [hashedRelationColors, setHashedRelationColors] = useLocalStorage(HASHED_RELATION_COLORS_KEY, false)
  const [jobcostDefaultRange, setJobcostDefaultRange] = useJobcostDefaultRange()
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

              {/* Grouped inspector: eyebrow-titled porcelain cards in the
                  command deck's material language — hairline seams between
                  rows, recessed wells, copper only on the active thumb. */}
              <div className="settings-body">
                <section>
                  <span className="settings-group-title">Display</span>
                  <div className="settings-group">
                    <div className="settings-row">
                      <div className="settings-row-info">
                        <span className="settings-row-label">
                          Appearance
                          <span className="settings-row-shortcut">
                            <kbd className="settings-kbd">⌘</kbd>
                            <kbd className="settings-kbd">/</kbd>
                          </span>
                        </span>
                        <span className="settings-row-description">Switch between light and dark mode</span>
                      </div>
                      <SegmentedControl
                        variant="settings"
                        role="radiogroup"
                        ariaLabel="Appearance"
                        layoutId="settingsThemeThumb"
                        value={theme}
                        options={[
                          { key: "light", label: <><Sun size={13} /> Light</> },
                          { key: "dark", label: <><Moon size={13} /> Dark</> },
                        ]}
                        onChange={onThemeChange}
                      />
                    </div>
                    <div className="settings-row">
                      <div className="settings-row-info">
                        <span className="settings-row-label">Margin Colors</span>
                        <span className="settings-row-description">Color margin values green / amber / red by health</span>
                      </div>
                      <SegmentedControl
                        variant="settings"
                        role="radiogroup"
                        ariaLabel="Margin colors"
                        layoutId="settingsMarginThumb"
                        value={marginColorsEnabled ? "on" : "off"}
                        options={ON_OFF}
                        onChange={(k) => setMarginColorsEnabled(k === "on")}
                      />
                    </div>
                    <div className="settings-row">
                      <div className="settings-row-info">
                        <span className="settings-row-label">Randomize Relation Colors</span>
                        <span className="settings-row-description">
                          Give each client, subcontractor and supplier its own consistent color instead of shades of one hue
                        </span>
                      </div>
                      <SegmentedControl
                        variant="settings"
                        role="radiogroup"
                        ariaLabel="Randomize relation colors"
                        layoutId="settingsRelationThumb"
                        value={hashedRelationColors ? "on" : "off"}
                        options={ON_OFF}
                        onChange={(k) => setHashedRelationColors(k === "on")}
                      />
                    </div>
                  </div>
                </section>

                <section>
                  <span className="settings-group-title">Job Costing</span>
                  <div className="settings-group">
                    <div className="settings-row settings-row--wrap">
                      <div className="settings-row-info">
                        <span className="settings-row-label">Opens to</span>
                        <span className="settings-row-description">Where the year and phase filters start each visit</span>
                      </div>
                      <SegmentedControl
                        variant="settings"
                        role="radiogroup"
                        ariaLabel="Job Costing default range"
                        layoutId="settingsJcRangeThumb"
                        value={jobcostDefaultRange}
                        options={JOBCOST_DEFAULT_RANGE_OPTIONS}
                        onChange={setJobcostDefaultRange}
                      />
                    </div>
                  </div>
                </section>

                {isAdmin && (
                  <section>
                    <span className="settings-group-title">Administration</span>
                    <div className="settings-group">
                      <div className="settings-row">
                        <div className="settings-row-info">
                          <span className="settings-row-label">
                            <Database size={15} />
                            Data Source Connection
                          </span>
                          <span className="settings-row-description">
                            {sqlConnected
                              ? "Disconnect the dashboard server from Sage"
                              : "Reconnect the dashboard server to Sage"}
                          </span>
                        </div>
                        <button
                          className={`settings-pill${
                            sqlConnected === null ? "" : sqlConnected ? " settings-pill--ok" : " settings-pill--bad"
                          }`}
                          onClick={handleSqlToggle}
                          disabled={sqlConnected === null || sqlLoading}
                        >
                          {sqlLoading ? "..." : sqlConnected === null ? "Checking..." : sqlConnected ? "Connected" : "Disconnected"}
                        </button>
                      </div>
                    </div>
                  </section>
                )}

                <section>
                  <span className="settings-group-title">Account</span>
                  <div className="settings-group">
                    <div className="settings-row">
                      <div className="settings-row-info">
                        <span className="settings-row-label settings-row-label--truncate">
                          {user?.email ?? "Your account"}
                        </span>
                      </div>
                      <button className="settings-toggle" onClick={handleSignOut}>
                        <LogOut size={14} />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
