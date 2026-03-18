import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import App from "../../App.tsx"
import RequireAuth from "./RequireAuth.tsx"
import LoginPage from "../auth/pages/LoginPage.tsx"
import LogoutPage from "../auth/pages/LogoutPage.tsx"
import SignoutPage from "../auth/pages/SignoutPage.tsx"
import Dashboard from "../../modules/dashboard/Dashboard.tsx"
import Jobcost from "../../modules/jobcost/Jobcost.tsx"
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
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/jobcosting" element={<Jobcost />} />
            <Route path="/users" element={<Users />} />

            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/clients/:id" element={<ClientDetailPage />} />

            <Route path="/suppliers" element={<SuppliersPage />} />
            <Route path="/suppliers/:id" element={<SupplierDetailPage />} />

            <Route path="/subcontractors" element={<SubcontractorsPage />} />
            <Route path="/subcontractors/:id" element={<SubcontractorDetailPage />} />

            <Route path="/invoices" element={<Invoices />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
