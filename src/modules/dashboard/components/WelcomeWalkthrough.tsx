import { TrendingUp, Truck, Wallet, type LucideIcon } from "lucide-react"
import { LAYOUT_TEMPLATES, type LayoutTemplate } from "../config/layoutTemplates"
import { useDashboardLayout } from "../context/DashboardLayoutContext"

// Presentational icon per template (kept out of config — purely cosmetic).
const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  operations: TrendingUp,
  procurement: Truck,
  financial: Wallet,
}

/**
 * First-run experience for a user who hasn't chosen a layout yet. Presents the
 * three preset layouts as cards with a short explanation; picking one commits
 * it and hands off to the gear hint (see GearHintPopover).
 */
export function WelcomeWalkthrough({
  onChosen,
  preview = false,
}: {
  onChosen: () => void
  /** Dev preview: show the flow without committing/persisting a layout choice. */
  preview?: boolean
}) {
  const { chooseTemplate } = useDashboardLayout()

  function pick(template: LayoutTemplate) {
    if (!preview) chooseTemplate(template)
    onChosen()
  }

  return (
    <div className="welcome-walkthrough">
      <div className="welcome-intro">
        <h2 className="title1 emphasized welcome-title">Welcome — let's set up your dashboard</h2>
        <p className="body welcome-subtitle">
          Pick a starting layout that matches how you work.
        </p>
      </div>

      <div className="welcome-cards">
        {LAYOUT_TEMPLATES.map((t) => {
          const Icon = TEMPLATE_ICONS[t.id] ?? TrendingUp
          return (
            <button key={t.id} type="button" className="welcome-card" onClick={() => pick(t)}>
              <span className="welcome-card-icon">
                <Icon size={24} />
              </span>
              <span className="welcome-card-name">{t.name}</span>
              <span className="welcome-card-desc">{t.description}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Step two of the walkthrough: once a layout is chosen, a small popover anchored
 * under the top-right gear tells the user they can re-customize anytime.
 */
export function GearHintPopover({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="gear-hint" role="dialog" aria-label="Customize your layout">
      <span className="gear-hint-arrow" aria-hidden="true" />
      <p className="gear-hint-body">
        Rearrange or resize your layout at anytime using the gear icon
      </p>
      <button type="button" className="gear-hint-dismiss" onClick={onDismiss}>
        Got it
      </button>
    </div>
  )
}
