import type { LucideIcon } from "lucide-react"
import {
  Home,
  Building,
  Users,
  Building2,
  FileText,
  Briefcase,
  Users2,
  Truck,
  HardHat,
  ClipboardList,
  DollarSign,
  Map,
  Network,
  BarChart3,
  MessageSquare,
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

export function isNavGroup(item: NavItem | NavGroup): item is NavGroup {
  return "items" in item
}

const navItems = {
  home: { label: "Home", path: "/dashboard", icon: Home },
  businessSummary: { label: "Company", path: "/company", icon: Building2 },
  jobcost: { label: "Job Costing", path: "/jobcost", icon: Building },
  changeOrders: { label: "Change Orders", path: "/change-orders", icon: ClipboardList },
  invoices: { label: "Invoices", path: "/invoices", icon: FileText },
  users: { label: "Users", path: "/users", icon: Users },
  clients: { label: "Clients", path: "/clients", icon: Users2 },
  vendors: { label: "Vendors", path: "/vendors", icon: Truck },
  subcontractors: { label: "Subcontractors", path: "/subcontractors", icon: HardHat },
  projects: { label: "Projects", path: "/projects", icon: Briefcase },
  cashFlow: { label: "Cash Flow", path: "/cash-flow", icon: DollarSign },
  revenueMap: { label: "Revenue Map", path: "/revenue-map", icon: Map },
  orgChart: { label: "Org Chart", path: "/org-chart", icon: Network },
  feedback: { label: "Feedback", path: "/feedback", icon: MessageSquare },
} as const satisfies Record<string, NavItem>

const directoryGroup: NavGroup = {
  label: "Directory",
  icon: Briefcase,
  items: [navItems.clients, navItems.vendors, navItems.subcontractors, navItems.projects],
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
      navItems.businessSummary,
      navItems.jobcost,
      navItems.changeOrders,
      navItems.invoices,
      directoryGroup,
      chartsGroup,
      navItems.users,
    ] as (NavItem | NavGroup)[],
  },
  admin: {
    appRole: "admin" as const,
    nav: [
      navItems.home,
      navItems.businessSummary,
      navItems.jobcost,
      navItems.changeOrders,
      navItems.invoices,
      directoryGroup,
      chartsGroup,
      navItems.users,
    ] as (NavItem | NavGroup)[],
  },
  pm: {
    appRole: "pm" as const,
    nav: [
      navItems.home,
      navItems.jobcost,
    ] as (NavItem | NavGroup)[],
  },
}

export type AppRole = keyof typeof roles
export const allRoles = Object.keys(roles) as AppRole[]
