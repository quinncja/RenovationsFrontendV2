import type { LucideIcon } from "lucide-react"
import JobcostIcon from "../components/JobcostIcon"
import ChangeOrderIcon from "../components/ChangeOrderIcon"
import {
  Home,
  Users,
  Building2,
  FileText,
  Briefcase,
  Users2,
  Truck,
  HardHat,
  IdCard,
  DollarSign,
  Map,
  Network,
  BarChart3,
  MessageSquare,
  Landmark,
  CalendarClock,
  Receipt,
  Clock,
} from "lucide-react"

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
}

export interface NavGroup {
  label: string
  icon: LucideIcon
  items: NavItem[]
}

/** Sentinel for a visual section separator between groups of nav items. */
export interface NavDivider {
  kind: "divider"
}

export const NAV_DIVIDER: NavDivider = { kind: "divider" }

export type NavEntry = NavItem | NavGroup | NavDivider

export function isNavGroup(item: NavEntry): item is NavGroup {
  return "items" in item
}

export function isNavDivider(item: NavEntry): item is NavDivider {
  return (item as NavDivider).kind === "divider"
}

const navItems = {
  home: { label: "Dashboard", path: "/dashboard", icon: Home },
  businessSummary: { label: "Company", path: "/company", icon: Building2 },
  jobcost: { label: "Job Costing", path: "/jobcost", icon: JobcostIcon as unknown as LucideIcon },
  // "Reports" the page (daily/weekly/monthly activity reports) — distinct from
  // the dashboard's `reports` home section (reconciliation/data quality).
  dailyReports: { label: "Activity", path: "/reports", icon: Clock },
  changeOrders: { label: "Change Orders", path: "/change-orders", icon: ChangeOrderIcon as unknown as LucideIcon },
  invoices: { label: "Invoices", path: "/invoices", icon: FileText },
  upcomingBillings: { label: "Upcoming Billings", path: "/upcoming-billings", icon: CalendarClock },
  progressBillings: { label: "Progress Billings", path: "/progress-billings", icon: Receipt },
  users: { label: "Users", path: "/users", icon: Users },
  clients: { label: "Clients", path: "/clients", icon: Users2 },
  vendors: { label: "Vendors", path: "/vendors", icon: Truck },
  subcontractors: { label: "Subcontractors", path: "/subcontractors", icon: HardHat },
  employees: { label: "Employees", path: "/employees", icon: IdCard },
  cashFlow: { label: "Cash Flow", path: "/cash-flow", icon: DollarSign },
  revenueMap: { label: "Revenue Map", path: "/revenue-map", icon: Map },
  orgChart: { label: "Org Chart", path: "/org-chart", icon: Network },
  feedback: { label: "Feedback", path: "/feedback", icon: MessageSquare },
} as const satisfies Record<string, NavItem>

const financesGroup: NavGroup = {
  label: "Finances",
  icon: Landmark,
  items: [navItems.invoices, navItems.upcomingBillings, navItems.progressBillings],
}

const directoryGroup: NavGroup = {
  label: "Directory",
  icon: Briefcase,
  items: [navItems.clients, navItems.vendors, navItems.subcontractors, navItems.employees],
}

const chartsGroup: NavGroup = {
  label: "Charts",
  icon: BarChart3,
  items: [navItems.orgChart, navItems.cashFlow, navItems.revenueMap],
}

// Shared by executive and the two top-tier roles (owner, tech) — identical nav.
const executiveNav: NavEntry[] = [
  navItems.home,
  navItems.jobcost,
  navItems.dailyReports,
  NAV_DIVIDER,
  navItems.changeOrders,
  financesGroup,
  NAV_DIVIDER,
  chartsGroup,
  directoryGroup,
  navItems.users,
]

// A project manager's non-admin layout.
const managerNav: NavEntry[] = [
  navItems.home,
  navItems.businessSummary,
  navItems.jobcost,
  navItems.dailyReports,
]

// A General Manager oversees the PMs rather than a single job: same non-admin
// tier, but Company drops out and Employees comes in (their home + Employees
// page are how they review the PM roster). Change Orders is company-wide work
// they own too. Data is company-wide, not job-scoped.
const generalManagerNav: NavEntry[] = [
  navItems.home,
  navItems.jobcost,
  NAV_DIVIDER,
  navItems.dailyReports,
  navItems.changeOrders,
  navItems.employees,
]

export const roles = {
  executive: {
    appRole: "executive" as const,
    nav: executiveNav,
  },
  // Top-tier roles with full (executive-equivalent) access + engagement
  // analytics. `owner` is badged with a crown on the Users page; `tech` is
  // deliberately invisible there (displayed as a plain executive).
  owner: {
    appRole: "owner" as const,
    nav: executiveNav,
  },
  tech: {
    appRole: "tech" as const,
    nav: executiveNav,
  },
  admin: {
    appRole: "admin" as const,
    nav: [
      navItems.home,
      navItems.jobcost,
      navItems.dailyReports,
      NAV_DIVIDER,
      navItems.changeOrders,
      financesGroup,
      NAV_DIVIDER,
      chartsGroup,
      directoryGroup,
      navItems.users,
    ] as NavEntry[],
  },
  manager: {
    appRole: "manager" as const,
    nav: managerNav,
  },
  // A General Manager oversees the project managers rather than a single job:
  // same non-admin layout as a manager, but their data spans EVERY job (they
  // have no `employeeId` binding). Distinct from `manager` so the backend's
  // token-scoped `role === 'manager'` filters never fire — GM falls through to
  // the unscoped, company-wide data path. Home page is a follow-up (§below).
  generalManager: {
    appRole: "generalManager" as const,
    nav: generalManagerNav,
  },
}

export type AppRole = keyof typeof roles
export const allRoles = Object.keys(roles) as AppRole[]

// `detailId` sentinel for a General Manager's home: the per-employee breakdown
// query treats this as "every job" (no single supervisor). Negative so it can
// never collide with a real SAGE employee/supervisor id (0 = unassigned).
export const ALL_JOBS_DETAIL_ID = -1

// ─── Role helpers ───────────────────────────────────────────────────────────
// owner/tech are top-tier: full access + engagement analytics. For ACCESS checks
// they collapse to "executive"; the raw claim is kept for display + analytics.

/** Collapse owner/tech → executive for route/permission checks. `generalManager`
 *  is deliberately NOT collapsed to `manager`: it needs its own identity so the
 *  onboarding sequence (no supervisor step) and data scope (all jobs, not one)
 *  diverge from a plain manager. Routes admit it via explicit allow-lists. */
export function effectiveRole(role: string | undefined | null): AppRole | undefined {
  if (role === "owner" || role === "tech") return "executive"
  return role && role in roles ? (role as AppRole) : undefined
}

/** A General Manager: manager-tier layout, company-wide (all-jobs) data. */
export function isGeneralManager(role: string | undefined | null): boolean {
  return role === "generalManager"
}

/** Only owner/tech may see the engagement-analytics surfaces. */
export function hasAnalyticsAccess(role: string | undefined | null): boolean {
  return role === "owner" || role === "tech"
}

export function isOwnerRole(role: string | undefined | null): boolean {
  return role === "owner"
}

/** Display role on the Users page: tech blends in as a plain admin (its column). */
export function displayRole(role: string | undefined | null): string {
  return role === "tech" ? "admin" : role ?? "waiting"
}
