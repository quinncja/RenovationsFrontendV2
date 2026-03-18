import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { AuthProvider } from "./core/auth/AuthProvider"
import Router from "./core/components/Router.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <Router />
    </AuthProvider>
  </StrictMode>,
)
