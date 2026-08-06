import { type ReactNode, type Ref } from "react"
import { motion } from "framer-motion"
import { SEG_SPRING } from "../animation/springs"

// One shared implementation of the "recessed well + sliding copper thumb"
// segmented control, previously hand-rolled four separate times (Job Costing
// command bar, Overhead Report's trend/movers toggles, Settings' toggles,
// Property Detail's PM filter) with identical structure but per-surface CSS.
//
// `variant` selects the CSS class family — each surface (dark command bar vs
// light card) keeps its own tuned well/thumb colors rather than forcing one
// visual treatment, so this consolidates the JSX/animation logic without
// touching any page's visual design. `role` preserves each call site's prior
// ARIA semantics (tabs for view switches, a toggle group for filters, a radio
// group for Settings' on/off rows).
export function SegmentedControl<K extends string>({
  value,
  options,
  onChange,
  layoutId,
  variant,
  role = "tablist",
  ariaLabel,
  className,
  rootRef,
}: {
  value: K | null
  options: readonly { key: K; label: ReactNode; title?: string }[]
  onChange: (key: K) => void
  layoutId: string
  variant: "jc" | "ohr" | "settings"
  role?: "tablist" | "group" | "radiogroup"
  ariaLabel?: string
  className?: string
  /** Forwarded to the root div — e.g. a coachmark tour target. */
  rootRef?: Ref<HTMLDivElement>
}) {
  const p = variant
  const itemRole = role === "tablist" ? "tab" : role === "radiogroup" ? "radio" : undefined

  return (
    <div ref={rootRef} className={`${p}-seg${className ? ` ${className}` : ""}`} role={role} aria-label={ariaLabel}>
      {options.map((o) => {
        const active = value === o.key
        return (
          <button
            key={o.key}
            type="button"
            role={itemRole}
            aria-selected={role === "tablist" ? active : undefined}
            aria-checked={role === "radiogroup" ? active : undefined}
            aria-pressed={role === "group" ? active : undefined}
            title={o.title}
            className={`${p}-seg-btn${active ? ` ${p}-seg-btn-active` : ""}`}
            onClick={() => onChange(o.key)}
          >
            {active && <motion.span layoutId={layoutId} className={`${p}-seg-thumb`} transition={SEG_SPRING} />}
            <span className={`${p}-seg-label`}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
