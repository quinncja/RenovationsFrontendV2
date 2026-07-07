import { RecentChangesCard } from "./RecentChangesCard"

// Registry wrappers for the admin "Recent Changes" section — company-wide
// feed with PM attribution per row. The manager home reuses the same card
// with source="pm" via PmRecentChangesSection below.

export function RecentProjectsWidget() {
  return <RecentChangesCard source="admin" showPm title="New Projects" kinds={["project"]} />
}

export function RecentCommitmentsWidget() {
  return (
    <RecentChangesCard
      source="admin"
      showPm
      title="New POs & Subcontracts"
      kinds={["purchaseOrder", "subcontract"]}
    />
  )
}

export function RecentCostsWidget() {
  return (
    <RecentChangesCard
      source="admin"
      showPm
      title="Costs & Vendor Invoices"
      kinds={["cost", "apInvoice"]}
    />
  )
}

export function RecentChangeOrdersWidget() {
  return <RecentChangesCard source="admin" showPm title="Change Orders" kinds={["changeOrder"]} />
}

export function RecentBillingWidget() {
  return (
    <RecentChangesCard
      source="admin"
      showPm
      title="Billing & Payments"
      kinds={["arInvoice", "payment"]}
    />
  )
}

/**
 * Manager-home placement: the manager dashboard is the fixed EmployeeDetail
 * page (no section registry), so the four project-change cards are hand-placed
 * as one block. Token-scoped to the manager's own jobs; no billing card and no
 * PM attribution (every row is theirs).
 */
export function PmRecentChangesSection() {
  return (
    <div className="widget-grid widget-grid-2">
      <RecentChangesCard source="pm" title="New Projects" kinds={["project"]} />
      <RecentChangesCard
        source="pm"
        title="New POs & Subcontracts"
        kinds={["purchaseOrder", "subcontract"]}
      />
      <RecentChangesCard source="pm" title="Costs & Vendor Invoices" kinds={["cost", "apInvoice"]} />
      <RecentChangesCard source="pm" title="Change Orders" kinds={["changeOrder"]} />
    </div>
  )
}
