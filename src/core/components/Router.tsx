import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import App from "../../App.tsx"
import RequireAuth, { RequireRole } from "./RequireAuth.tsx"
import LoginPage from "../auth/pages/LoginPage.tsx"
import LogoutPage from "../auth/pages/LogoutPage.tsx"
import SignoutPage from "../auth/pages/SignoutPage.tsx"
import Dashboard from "../../modules/dashboard/Dashboard.tsx"
import Jobcost from "../../modules/jobcost/Jobcost.tsx"
import JobcostDetailPage from "../../modules/jobcost/JobcostDetailPage.tsx"
import Users from "../../modules/users/users.tsx"
import ClientsPage from "../../modules/clients/ClientsPage.tsx"
import ClientDetailPage from "../../modules/clients/ClientDetailPage.tsx"
import SuppliersPage from "../../modules/suppliers/SuppliersPage.tsx"
import SupplierDetailPage from "../../modules/suppliers/SupplierDetailPage.tsx"
import SubcontractorsPage from "../../modules/subcontractors/SubcontractorsPage.tsx"
import SubcontractorDetailPage from "../../modules/subcontractors/SubcontractorDetailPage.tsx"
import Invoices from "../../modules/invoices/Invoices.tsx"

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth pages — no navbar */}
        <Route index element={<Navigate to="/login" replace />} />
        {/* <Route path="/signup" element={<SignupPage />} /> */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/logout" element={<LogoutPage />} />
        <Route path="/signout" element={<SignoutPage />} />

        {/* App shell — includes navbar */}
        <Route element={<App />}>
          <Route element={<RequireAuth />}>
            {/* Executive only */}
            <Route path="/dashboard" element={<RequireRole allowed={["executive"]}><Dashboard /></RequireRole>} />

            {/* All roles */}
            <Route path="/jobcosting" element={<Jobcost />} />
            <Route path="/jobcosting/:recnum" element={<JobcostDetailPage />} />

            {/* Executive + Admin */}
            <Route path="/users" element={<RequireRole allowed={["executive", "admin"]}><Users /></RequireRole>} />

            <Route path="/clients" element={<RequireRole allowed={["executive", "admin"]}><ClientsPage /></RequireRole>} />
            <Route path="/clients/:id" element={<RequireRole allowed={["executive", "admin"]}><ClientDetailPage /></RequireRole>} />

            <Route path="/suppliers" element={<RequireRole allowed={["executive", "admin"]}><SuppliersPage /></RequireRole>} />
            <Route path="/suppliers/:id" element={<RequireRole allowed={["executive", "admin"]}><SupplierDetailPage /></RequireRole>} />

            <Route path="/subcontractors" element={<RequireRole allowed={["executive", "admin"]}><SubcontractorsPage /></RequireRole>} />
            <Route path="/subcontractors/:id" element={<RequireRole allowed={["executive", "admin"]}><SubcontractorDetailPage /></RequireRole>} />

            <Route path="/invoices" element={<RequireRole allowed={["executive", "admin"]}><Invoices /></RequireRole>} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
