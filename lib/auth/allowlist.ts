export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

/** True only if the email is on the comma-separated allowlist. An empty list allows nobody. */
export function isEmailAllowed(email: string | null | undefined, raw: string | undefined): boolean {
  if (!email) return false
  return parseAllowlist(raw).has(email.trim().toLowerCase())
}
