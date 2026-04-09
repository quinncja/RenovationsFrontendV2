import type { LucideIcon } from "lucide-react"
import { Home, Building, Users, Building2, FileText, Briefcase, Users2, Truck, HardHat } from "lucide-react"

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
  jobcost: { label: "Projects", path: "/jobcosting", icon: Building },
  invoices: { label: "Invoices", path: "/invoices", icon: FileText },
  users: { label: "Users", path: "/users", icon: Users },
  company: { label: "Company", path: "/company-summary", icon: Building2 },
  clients: { label: "Clients", path: "/clients", icon: Users2 },
  suppliers: { label: "Vendors", path: "/suppliers", icon: Truck },
  subcontractors: { label: "Subcontractors", path: "/subcontractors", icon: HardHat },
} as const satisfies Record<string, NavItem>

const companiesGroup: NavGroup = {
  label: "Directory",
  icon: Briefcase,
  items: [navItems.clients, navItems.suppliers, navItems.subcontractors],
}

export const roles = {
  executive: {
    appRole: "executive" as const,
    nav: [navItems.home, navItems.jobcost, navItems.invoices, companiesGroup, navItems.users] as (NavItem | NavGroup)[],
  },
  admin: {
    appRole: "admin" as const,
    nav: [navItems.jobcost, navItems.invoices, companiesGroup, navItems.users] as (NavItem | NavGroup)[],
  },
  manager: {
    appRole: "manager" as const,
    nav: [navItems.jobcost] as (NavItem | NavGroup)[],
  },
}

export type AppRole = keyof typeof roles
export const allRoles = Object.keys(roles) as AppRole[]
