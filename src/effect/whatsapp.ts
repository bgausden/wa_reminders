/**
 * WhatsApp click-to-chat helpers for dry-run HTML output.
 *
 * Link format: `https://wa.me/<digits>?text=<encodeURIComponent(message)>`
 * which opens WhatsApp Web/app with the number and body pre-filled.
 */

export interface WhatsAppClientPhones {
  MobilePhone?: string | null
  HomePhone?: string | null
}

/**
 * Normalize a raw phone string to digits for `wa.me`.
 *
 * - Strips all non-digits.
 * - Strips a leading `00` international call prefix (e.g. `00852...`).
 * - If more than 8 digits remain, assumes an international prefix is
 *   already present and returns the digits as-is.
 * - Otherwise (8 or fewer digits, the Hong Kong local case) prefixes `852`.
 * - Returns null when no digits remain.
 */
export const normalizePhoneForWhatsApp = (raw: string | null | undefined): string | null => {
  if (raw === null || raw === undefined) return null
  let digits = raw.replace(/\D/g, '')
  if (digits.length === 0) return null
  if (digits.length > 8 && digits.startsWith('00')) {
    digits = digits.slice(2)
    if (digits.length === 0) return null
  }
  if (digits.length > 8) {
    // Already international (e.g. `85291234567`, `14155552671`).
    // Strip any stray trunk zero left after the 00 handling.
    const stripped = digits.replace(/^0+/, '')
    return stripped.length > 0 ? stripped : null
  }
  return `852${digits}`
}

/**
 * Prefer MobilePhone, fall back to HomePhone, then normalize.
 * Returns null when neither yields usable digits.
 */
export const clientPhoneForWhatsApp = (
  client: WhatsAppClientPhones | undefined | null
): string | null => {
  if (!client) return null
  const mobile = typeof client.MobilePhone === 'string' ? client.MobilePhone.trim() : ''
  if (mobile.length > 0) {
    const normalized = normalizePhoneForWhatsApp(mobile)
    if (normalized) return normalized
  }
  const home = typeof client.HomePhone === 'string' ? client.HomePhone.trim() : ''
  if (home.length > 0) {
    const normalized = normalizePhoneForWhatsApp(home)
    if (normalized) return normalized
  }
  return null
}

/** Build a `wa.me` click-to-chat URL for pre-filled digits + message. */
export const buildWhatsAppLink = (digits: string, message: string): string =>
  `https://wa.me/${digits}?text=${encodeURIComponent(message)}`

/** Minimal HTML escaper for text content and attribute values. */
export const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
