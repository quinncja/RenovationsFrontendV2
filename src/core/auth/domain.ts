// Only @renovationsdelivered.com accounts may use the app. This is a UX guard;
// the backend enforces the same rule on every request as the real gate.
export const ALLOWED_EMAIL_DOMAIN = "renovationsdelivered.com"

export function isAllowedEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)
}

export const DOMAIN_ERROR = `Only @${ALLOWED_EMAIL_DOMAIN} accounts are allowed.`
