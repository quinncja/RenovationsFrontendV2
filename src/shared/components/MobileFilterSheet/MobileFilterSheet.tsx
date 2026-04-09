import { useState, useEffect, useCallback } from "react"
import { X, Check } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

export interface FilterOption {
  value: string
  label: string
  colorClass?: string
}

export interface FilterGroup {
  key: string
  label: string
  options: FilterOption[]
}

interface MobileFilterSheetProps {
  open: boolean
  onClose: () => void
  groups: FilterGroup[]
  values: Record<string, string>
  defaults: Record<string, string>
  onChange: (values: Record<string, string>) => void
}

export function MobileFilterSheet({
  open,
  onClose,
  groups,
  values,
  defaults,
  onChange,
}: MobileFilterSheetProps) {
  // Local draft state so changes aren't applied until "Done"
  const [draft, setDraft] = useState<Record<string, string>>(values)

  // Sync draft when opening
  useEffect(() => {
    if (open) setDraft(values)
  }, [open, values])

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
      return () => { document.body.style.overflow = "" }
    }
  }, [open])

  const setGroupValue = useCallback((key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleClear = useCallback(() => {
    setDraft({ ...defaults })
  }, [defaults])

  const handleDone = useCallback(() => {
    onChange(draft)
    onClose()
  }, [draft, onChange, onClose])

  const isDraftDirty = groups.some((g) => draft[g.key] !== defaults[g.key])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="mfs-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="mfs-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            {/* ── Header ── */}
            <div className="mfs-header">
              <button
                className="mfs-header-action mfs-clear"
                onClick={handleClear}
                disabled={!isDraftDirty}
              >
                Clear All
              </button>
              <span className="mfs-title">Filters</span>
              <button className="mfs-header-action mfs-done" onClick={handleDone}>
                Done
              </button>
            </div>

            {/* ── Filter groups ── */}
            <div className="mfs-body">
              {groups.map((group) => (
                <div key={group.key} className="mfs-group">
                  <span className="mfs-group-label">{group.label}</span>
                  <div className="mfs-options">
                    {group.options.map((opt) => {
                      const isSelected = draft[group.key] === opt.value
                      return (
                        <button
                          key={opt.value}
                          className={`mfs-option${isSelected ? " mfs-option-selected" : ""}`}
                          onClick={() => setGroupValue(group.key, opt.value)}
                        >
                          {opt.colorClass && (
                            <span className={`mfs-option-dot ${opt.colorClass}`} />
                          )}
                          <span className="mfs-option-label">{opt.label}</span>
                          {isSelected && <Check size={18} className="mfs-option-check" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Returns the count of filters that differ from their defaults */
export function activeFilterCount(
  values: Record<string, string>,
  defaults: Record<string, string>
): number {
  return Object.keys(defaults).filter((k) => values[k] !== defaults[k]).length
}
