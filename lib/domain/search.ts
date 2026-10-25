/** Escapes %, _ and \ so user input matches literally inside LIKE/ILIKE. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** "%term%" for an ILIKE contains-search, or null for a blank term. */
export function merchantPattern(term: string): string | null {
  const t = term.trim()
  return t ? `%${escapeLike(t)}%` : null
}

/**
 * Literal, case-insensitive contains-match. PostgREST turns `*` inside an ilike value into a
 * wildcard and it can't be escaped, so database results are re-checked with this.
 */
export function merchantMatches(merchant: string | null, term: string): boolean {
  const t = term.trim().toLowerCase()
  return merchant !== null && merchant.toLowerCase().includes(t)
}
