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
  home: { label: "Home", path: "/dashboard", icon: Home },
  businessSummary: { label: "Company", path: "/company", icon: Building2 },
  jobcost: { label: "Job Costing", path: "/jobcost", icon: JobcostIcon as unknown as LucideIcon },
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

export const roles = {
  executive: {
    appRole: "executive" as const,
    nav: [
      navItems.home,
      navItems.jobcost,
      NAV_DIVIDER,
      navItems.changeOrders,
      financesGroup,
      NAV_DIVIDER,
      chartsGroup,
      directoryGroup,
      navItems.users,
    ] as NavEntry[],
  },
  admin: {
    appRole: "admin" as const,
    nav: [
      navItems.home,
      navItems.jobcost,
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
    nav: [
      navItems.home,
      navItems.businessSummary,
      navItems.jobcost,
    ] as NavEntry[],
  },
}

export type AppRole = keyof typeof roles
export const allRoles = Object.keys(roles) as AppRole[]
