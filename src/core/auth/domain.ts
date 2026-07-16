// Only @renovationsdelivered.com accounts may use the app, plus an explicit
// allowlist of external partner accounts. This is a UX guard; the backend
// enforces the same rule on every request as the real gate (its allowlist
// lives in @shared/middleware/auth.middleware.js — keep the two in sync).
export const ALLOWED_EMAIL_DOMAIN = "renovationsdelivered.com"

export const EXTERNAL_ALLOWED_EMAILS = ["rd@rektio.com"]

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const normalized = email.toLowerCase()
  return (
    normalized.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`) ||
    EXTERNAL_ALLOWED_EMAILS.includes(normalized)
  )
}

export const DOMAIN_ERROR = `Only @${ALLOWED_EMAIL_DOMAIN} accounts are allowed.`
