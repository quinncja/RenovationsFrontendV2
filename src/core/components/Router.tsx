import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import App from "../../App.tsx"
import RequireAuth, { RequireRole } from "./RequireAuth.tsx"
import LoginPage from "../auth/pages/LoginPage.tsx"
import LogoutPage from "../auth/pages/LogoutPage.tsx"
import SignoutPage from "../auth/pages/SignoutPage.tsx"

// Modules — lazy loaded. No per-route Suspense here: App wraps its <Outlet/>
// in ONE persistent boundary, so navigations keep the current page up while
// the next chunk loads instead of flashing a blank fallback (see App.tsx).
import { lazy } from "react"

const Dashboard = lazy(() => import("../../modules/dashboard/Dashboard.tsx"))
const BusinessSummary = lazy(() => import("../../modules/business-summary/BusinessSummaryPage.tsx"))
const Jobcost = lazy(() => import("../../modules/jobcost/Jobcost.tsx"))
const JobcostDetailPage = lazy(() => import("../../modules/jobcost/JobcostDetailPage.tsx"))
const PropertyDetailPage = lazy(() => import("../../modules/jobcost/PropertyDetailPage.tsx"))
const ChangeOrders = lazy(() => import("../../modules/change-orders/ChangeOrdersPage.tsx"))
const ReportsPage = lazy(() => import("../../modules/dashboard/report/ReportsPage.tsx"))
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
const ProgressBillingsPage = lazy(() => import("../../modules/dashboard/ProgressBillingsPage.tsx"))
const Invoices = lazy(() => import("../../modules/invoices/Invoices.tsx"))
const OverheadReportPage = lazy(() => import("../../modules/dashboard/OverheadReportPage.tsx"))
const Users = lazy(() => import("../../modules/users/Users.tsx"))
const FeedbackPage = lazy(() => import("../../modules/feedback/FeedbackPage.tsx"))

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
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/breakdown/:category" element={<RequireRole allowed={["executive", "admin"]}><MonthlyBreakdownPage /></RequireRole>} />
            <Route path="/dashboard/upcoming-billings" element={<RequireRole allowed={["executive", "admin"]}><UpcomingBillingsPage /></RequireRole>} />
            <Route path="/employees" element={<RequireRole allowed={["executive", "admin", "manager", "generalManager"]}><EmployeesPage /></RequireRole>} />
            <Route path="/employees/:employeeNum" element={<RequireRole allowed={["executive", "admin", "manager", "generalManager"]}><EmployeeDetailPage /></RequireRole>} />

            {/* Company — shown in nav for managers (PMs); GMs use Employees instead */}
            <Route path="/company" element={
              <RequireRole allowed={["executive", "admin", "manager"]}>
                <BusinessSummary />
              </RequireRole>
            } />

            {/* Job Costing — all roles */}
            <Route path="/jobcost" element={<Jobcost />} />
            <Route path="/jobcost/:recnum" element={<JobcostDetailPage />} />
            <Route path="/jobcost/property/:parent" element={<PropertyDetailPage />} />

            {/* Reports — daily/weekly/monthly activity; all roles (managers
                get the token-scoped variant, GMs the company-wide one) */}
            <Route path="/reports" element={
              <RequireRole allowed={["executive", "admin", "manager", "generalManager"]}>
                <ReportsPage />
              </RequireRole>
            } />

            {/* Change Orders — admin/executive + GM (company-wide tier) get
                the full list with create/delete; managers get a view-only
                list the backend scopes to their own jobs. Creation happens
                in the page's wizard modal — there is no /new route. */}
            <Route path="/change-orders" element={
              <RequireRole allowed={["executive", "admin", "generalManager", "manager"]}>
                <ChangeOrders />
              </RequireRole>
            } />

            {/* Finances — admin/executive. Billings reuse the dashboard
                drill-down pages; the /dashboard/* routes above stay for the
                dashboard widgets' own links. */}
            <Route path="/invoices" element={
              <RequireRole allowed={["executive", "admin"]}>
                <Invoices />
              </RequireRole>
            } />
            <Route path="/upcoming-billings" element={
              <RequireRole allowed={["executive", "admin"]}>
                <UpcomingBillingsPage />
              </RequireRole>
            } />
            <Route path="/progress-billings" element={
              <RequireRole allowed={["executive", "admin"]}>
                <ProgressBillingsPage />
              </RequireRole>
            } />
            <Route path="/overhead-report" element={
              <RequireRole allowed={["executive", "admin"]}>
                <OverheadReportPage />
              </RequireRole>
            } />

            {/* Directory — admin/executive */}
            <Route path="/clients" element={<RequireRole allowed={["executive", "admin"]}><ClientsPage /></RequireRole>} />
            <Route path="/clients/:id" element={<RequireRole allowed={["executive", "admin"]}><ClientDetailPage /></RequireRole>} />
            <Route path="/vendors" element={<RequireRole allowed={["executive", "admin"]}><VendorsPage /></RequireRole>} />
            <Route path="/vendors/:id" element={<RequireRole allowed={["executive", "admin"]}><VendorDetailPage /></RequireRole>} />
            <Route path="/subcontractors" element={<RequireRole allowed={["executive", "admin"]}><SubcontractorsPage /></RequireRole>} />
            <Route path="/subcontractors/:id" element={<RequireRole allowed={["executive", "admin"]}><SubcontractorDetailPage /></RequireRole>} />

            {/* Charts — admin/executive */}
            <Route path="/cash-flow" element={<RequireRole allowed={["executive", "admin"]}><CashFlow /></RequireRole>} />
            <Route path="/revenue-map" element={<RequireRole allowed={["executive", "admin"]}><RevenueMap /></RequireRole>} />
            <Route path="/org-chart" element={<RequireRole allowed={["executive", "admin"]}><OrgChart /></RequireRole>} />

            {/* Users — admin/executive */}
            <Route path="/users" element={<RequireRole allowed={["executive", "admin"]}><Users /></RequireRole>} />

            {/* Feedback — admin/executive */}
            <Route path="/feedback" element={<RequireRole allowed={["executive", "admin"]}><FeedbackPage /></RequireRole>} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
