import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { AuthProvider } from "./core/auth/AuthProvider"
import { OnboardingProvider } from "./core/onboarding/OnboardingProvider"
import Router from "./core/components/Router.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <OnboardingProvider>
        <Router />
      </OnboardingProvider>
    </AuthProvider>
  </StrictMode>,
)
