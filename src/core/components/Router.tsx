import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import App from "../../App.tsx"
import RequireAuth, { RequireRole } from "./RequireAuth.tsx"
import LoginPage from "../auth/pages/LoginPage.tsx"
import LogoutPage from "../auth/pages/LogoutPage.tsx"
import SignoutPage from "../auth/pages/SignoutPage.tsx"

// Modules — lazy loaded
import { lazy, Suspense } from "react"
import LoadingScreen from "./LoadingScreen.tsx"

const Dashboard = lazy(() => import("../../modules/dashboard/Dashboard.tsx"))
const BusinessSummary = lazy(() => import("../../modules/business-summary/BusinessSummaryPage.tsx"))
const Jobcost = lazy(() => import("../../modules/jobcost/Jobcost.tsx"))
const JobcostDetailPage = lazy(() => import("../../modules/jobcost/JobcostDetailPage.tsx"))
const ChangeOrders = lazy(() => import("../../modules/change-orders/ChangeOrdersPage.tsx"))
const NewChangeOrder = lazy(() => import("../../modules/change-orders/components/NewChangeOrder.tsx"))
const CashFlow = lazy(() => import("../../modules/cash-flow/CashFlowPage.tsx"))
const RevenueMap = lazy(() => import("../../modules/revenue-map/RevenueMapPage.tsx"))
const OrgChart = lazy(() => import("../../modules/org-chart/OrgChartPage.tsx"))
const ClientsPage = lazy(() => import("../../modules/directory/clients/ClientsPage.tsx"))
const ClientDetailPage = lazy(() => import("../../modules/directory/clients/ClientDetailPage.tsx"))
const VendorsPage = lazy(() => import("../../modules/directory/vendors/VendorsPage.tsx"))
const VendorDetailPage = lazy(() => import("../../modules/directory/vendors/VendorDetailPage.tsx"))
const SubcontractorsPage = lazy(() => import("../../modules/directory/subcontractors/SubcontractorsPage.tsx"))
const SubcontractorDetailPage = lazy(() => import("../../modules/directory/subcontractors/SubcontractorDetailPage.tsx"))
const EmployeeDetailPage = lazy(() => import("../../modules/dashboard/EmployeeDetailPage.tsx"))
const EmployeesPage = lazy(() => import("../../modules/directory/employees/EmployeesPage.tsx"))
const MonthlyBreakdownPage = lazy(() => import("../../modules/dashboard/MonthlyBreakdownPage.tsx"))
const UpcomingBillingsPage = lazy(() => import("../../modules/dashboard/UpcomingBillingsPage.tsx"))
const Invoices = lazy(() => import("../../modules/invoices/Invoices.tsx"))
const Users = lazy(() => import("../../modules/users/Users.tsx"))
const FeedbackPage = lazy(() => import("../../modules/feedback/FeedbackPage.tsx"))

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingScreen />}>{children}</Suspense>
}

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth pages — no navbar */}
        <Route index element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/logout" element={<LogoutPage />} />
        <Route path="/signout" element={<SignoutPage />} />

        {/* App shell — includes navbar */}
        <Route element={<App />}>
          <Route element={<RequireAuth />}>
            {/* Dashboard — admin/executive see full, PM sees limited */}
            <Route path="/dashboard" element={<SuspenseWrapper><Dashboard /></SuspenseWrapper>} />
            <Route path="/dashboard/breakdown/:category" element={<RequireRole allowed={["executive", "admin"]}><SuspenseWrapper><MonthlyBreakdownPage /></SuspenseWrapper></RequireRole>} />
            <Route path="/dashboard/upcoming-billings" element={<RequireRole allowed={["executive", "admin"]}><SuspenseWrapper><UpcomingBillingsPage /></SuspenseWrapper></RequireRole>} />
            <Route path="/employees" element={<RequireRole allowed={["executive", "admin", "manager"]}><SuspenseWrapper><EmployeesPage /></SuspenseWrapper></RequireRole>} />
            <Route path="/employees/:employeeNum" element={<RequireRole allowed={["executive", "admin", "manager"]}><SuspenseWrapper><EmployeeDetailPage /></SuspenseWrapper></RequireRole>} />

            {/* Company — shown in nav for managers (PMs); see roles.ts */}
            <Route path="/company" element={
              <RequireRole allowed={["executive", "admin", "manager"]}>
                <SuspenseWrapper><BusinessSummary /></SuspenseWrapper>
              </RequireRole>
            } />

            {/* Job Costing — all roles */}
            <Route path="/jobcost" element={<SuspenseWrapper><Jobcost /></SuspenseWrapper>} />
            <Route path="/jobcost/:recnum" element={<SuspenseWrapper><JobcostDetailPage /></SuspenseWrapper>} />

            {/* Change Orders — admin/executive */}
            <Route path="/change-orders" element={
              <RequireRole allowed={["executive", "admin"]}>
                <SuspenseWrapper><ChangeOrders /></SuspenseWrapper>
              </RequireRole>
            } />
            <Route path="/change-orders/new" element={
              <RequireRole allowed={["executive", "admin"]}>
                <SuspenseWrapper><NewChangeOrder /></SuspenseWrapper>
              </RequireRole>
            } />

            {/* Invoices — admin/executive */}
            <Route path="/invoices" element={
              <RequireRole allowed={["executive", "admin"]}>
                <SuspenseWrapper><Invoices /></SuspenseWrapper>
              </RequireRole>
            } />

            {/* Directory — admin/executive */}
            <Route path="/clients" element={<RequireRole allowed={["executive", "admin"]}><SuspenseWrapper><ClientsPage /></SuspenseWrapper></RequireRole>} />
            <Route path="/clients/:id" element={<RequireRole allowed={["executive", "admin"]}><SuspenseWrapper><ClientDetailPage /></SuspenseWrapper></RequireRole>} />
            <Route path="/vendors" element={<RequireRole allowed={["executive", "admin"]}><SuspenseWrapper><VendorsPage /></SuspenseWrapper></RequireRole>} />
            <Route path="/vendors/:id" element={<RequireRole allowed={["executive", "admin"]}><SuspenseWrapper><VendorDetailPage /></SuspenseWrapper></RequireRole>} />
            <Route path="/subcontractors" element={<RequireRole allowed={["executive", "admin"]}><SuspenseWrapper><SubcontractorsPage /></SuspenseWrapper></RequireRole>} />
            <Route path="/subcontractors/:id" element={<RequireRole allowed={["executive", "admin"]}><SuspenseWrapper><SubcontractorDetailPage /></SuspenseWrapper></RequireRole>} />

            {/* Charts — admin/executive */}
            <Route path="/cash-flow" element={<RequireRole allowed={["executive", "admin"]}><SuspenseWrapper><CashFlow /></SuspenseWrapper></RequireRole>} />
            <Route path="/revenue-map" element={<RequireRole allowed={["executive", "admin"]}><SuspenseWrapper><RevenueMap /></SuspenseWrapper></RequireRole>} />
            <Route path="/org-chart" element={<RequireRole allowed={["executive", "admin"]}><SuspenseWrapper><OrgChart /></SuspenseWrapper></RequireRole>} />

            {/* Users — admin/executive */}
            <Route path="/users" element={<RequireRole allowed={["executive", "admin"]}><SuspenseWrapper><Users /></SuspenseWrapper></RequireRole>} />

            {/* Feedback — admin/executive */}
            <Route path="/feedback" element={<RequireRole allowed={["executive", "admin"]}><SuspenseWrapper><FeedbackPage /></SuspenseWrapper></RequireRole>} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
