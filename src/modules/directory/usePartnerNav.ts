import { useCallback } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "../../core/auth/AuthProvider"
import { effectiveRole } from "../../core/auth/roles"
import { deriveBackLabel, type JobcostBackState } from "../jobcost/useJobcostNav"

export type PartnerKind = "client" | "vendor" | "subcontractor"

export const PARTNER_PATHS: Record<PartnerKind, string> = {
  client: "/clients",
  vendor: "/vendors",
  subcontractor: "/subcontractors",
}

/** Navigation to the directory (partner) detail pages — /clients/:id,
 *  /vendors/:id, /subcontractors/:id, all keyed on the Sage recnum.
 *
 *  Those routes are gated to executive/admin (see Router.tsx), so
 *  `canViewPartners` says whether a vendor/client name should render as a link
 *  at all: other roles keep the plain text instead of a link that would bounce
 *  them to /dashboard. */
export function usePartnerNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { claims } = useAuth()
  const role = effectiveRole(claims["role"] as string | undefined)
  const canViewPartners = role === "executive" || role === "admin"

  // Same router-state contract as useJobcostNav: stash where we came from so
  // the detail page's back button returns there, labeled by source.
  const goToPartner = useCallback(
    (kind: PartnerKind, id: string | number, opts?: { backLabel?: string }) => {
      const state: JobcostBackState = {
        backTo: location.pathname + location.search,
        backLabel: opts?.backLabel ?? deriveBackLabel(location.pathname),
      }
      navigate(`${PARTNER_PATHS[kind]}/${id}`, { state })
    },
    [navigate, location.pathname, location.search]
  )

  return { canViewPartners, goToPartner }
}
