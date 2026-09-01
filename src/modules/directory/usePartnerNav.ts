import { useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../../core/auth/AuthProvider"
import { effectiveRole } from "../../core/auth/roles"

export type PartnerKind = "client" | "vendor" | "subcontractor"

const PARTNER_PATHS: Record<PartnerKind, string> = {
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
  const { claims } = useAuth()
  const role = effectiveRole(claims["role"] as string | undefined)
  const canViewPartners = role === "executive" || role === "admin"

  const goToPartner = useCallback(
    (kind: PartnerKind, id: string | number) => navigate(`${PARTNER_PATHS[kind]}/${id}`),
    [navigate]
  )

  return { canViewPartners, goToPartner }
}
