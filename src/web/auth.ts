/**
 * Session auth for the hosted reminder report.
 *
 * Pure and dependency-free apart from `node:crypto`. The shared password is
 * always an argument — it is an app setting at the edge, so nothing here reads
 * `process.env`, and neither the password nor the session value is ever logged.
 *
 * There is no session store: a session value is a signed expiry, so verifying
 * one is a local computation and a warm function can be restarted or scaled
 * out without losing anybody's login.
 *
 * The cookie itself, the request parsing, and the HTTP responses belong to the
 * Azure adapter in the follow-up slice.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

/** A signed session lasts about 30 days: the team signs in once, not daily. */
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000

/** `Max-Age` (seconds) of the auth cookie, matching {@link SESSION_LIFETIME_MS}. */
export const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_LIFETIME_MS / 1000)

/** Name of the auth cookie the HTTP adapter sets and reads. */
export const SESSION_COOKIE_NAME = 'wa_session'

const SEPARATOR = '.'
const BASE64URL = /^[A-Za-z0-9_-]+$/
const EXPIRY = /^\d{1,20}$/

export interface Session {
  /**
   * `base64url(payload).base64url(hmacSha256(payload))`, where the payload is
   * the expiry in epoch milliseconds. Opaque to the browser and meaningless
   * without the password, which never leaves the server.
   */
  value: string
  /** The instant after which this session is no longer accepted. */
  expiresAt: Date
}

const sign = (payload: string, password: string): Buffer =>
  createHmac('sha256', password).update(payload).digest()

const encode = (text: string): string => Buffer.from(text, 'utf8').toString('base64url')

/**
 * Strict base64url decode. `Buffer.from` alone is too forgiving for hostile
 * input (it drops invalid characters), so the decoded bytes must re-encode to
 * exactly the text presented.
 */
const decode = (part: string): Buffer | null => {
  if (!BASE64URL.test(part)) return null
  const bytes = Buffer.from(part, 'base64url')
  return bytes.toString('base64url') === part ? bytes : null
}

/**
 * Issue a session signed with the shared password.
 *
 * Derived only from the password and the expiry, so it is deterministic: the
 * same password and instant always produce the same value, and no state has to
 * be kept anywhere.
 *
 * Throws when the password is empty — a blank app setting is a configuration
 * mistake, and failing loudly at sign-in beats handing out sessions that
 * {@link verifySession} would only ever reject.
 */
export function issueSession(password: string, now: Date = new Date()): Session {
  if (password === '') {
    throw new Error('issueSession: the report password is blank (check the app setting)')
  }
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS)
  const payload = encode(String(expiresAt.getTime()))
  const value = `${payload}${SEPARATOR}${sign(payload, password).toString('base64url')}`
  return { value, expiresAt }
}

/**
 * Is this presented value a session we issued, for this password, still in date?
 *
 * Rejects anything expired, signed with another password, or malformed — and
 * never throws on hostile input, because the value arrives from a browser. The
 * signature is checked before the payload is trusted, and compared in constant
 * time so a wrong signature reveals nothing about how close it was.
 */
export function verifySession(
  value: string | null | undefined,
  password: string,
  now: Date = new Date()
): boolean {
  if (typeof value !== 'string' || value === '') return false
  // Fail closed: no password configured means nobody gets in.
  if (password === '') return false

  const separator = value.indexOf(SEPARATOR)
  if (separator <= 0 || separator !== value.lastIndexOf(SEPARATOR)) return false
  const payloadPart = value.slice(0, separator)
  const signaturePart = value.slice(separator + 1)
  if (payloadPart === '' || signaturePart === '') return false

  const presented = decode(signaturePart)
  if (presented === null) return false
  const expected = sign(payloadPart, password)
  if (presented.length !== expected.length) return false
  if (!timingSafeEqual(presented, expected)) return false

  const payload = decode(payloadPart)
  if (payload === null) return false
  const expiresAtText = payload.toString('utf8')
  if (!EXPIRY.test(expiresAtText)) return false

  const nowMs = now.getTime()
  if (Number.isNaN(nowMs)) return false
  return nowMs < Number(expiresAtText)
}

/**
 * The `Set-Cookie` header value for a freshly issued session: invisible to
 * client script, HTTPS only, sent on ordinary navigation to the app, and
 * scoped to the whole site.
 */
export function sessionCookie(value: string): string {
  return (
    `${SESSION_COOKIE_NAME}=${value}; ` +
    `Max-Age=${SESSION_MAX_AGE_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`
  )
}

/**
 * Minimal HTML escaper for text content.
 *
 * Deliberately local rather than imported from the WhatsApp/render helpers:
 * those live under `src/effect/**` and this module is meant to stand alone, and
 * the escaper is four substitutions.
 */
const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const PAGE_STYLE =
  'body{font-family:system-ui,sans-serif;max-width:22rem;margin:3rem auto;padding:0 1rem}' +
  'h1{font-size:1.25rem}label{display:block;margin:1rem 0 .25rem}' +
  'input,button{font-size:1rem;width:100%;padding:.6rem;box-sizing:border-box}' +
  'button{margin-top:1.25rem}.message{color:#a00}'

/**
 * The login page: one password field, posting back to the same URL.
 *
 * `message` (e.g. "Wrong password") is rendered above the form and HTML-escaped,
 * since it is user-visible output. No client-side JavaScript.
 */
export function loginPage(message?: string | null): string {
  const notice =
    typeof message === 'string' && message.trim() !== ''
      ? `<p class="message">${escapeHtml(message)}</p>\n`
      : ''
  return (
    `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>Reminders — sign in</title>\n<style>${PAGE_STYLE}</style>\n</head>\n<body>\n` +
    `<h1>Reminder list</h1>\n${notice}` +
    `<form method="post" action="">\n` +
    `<label for="password">Password</label>\n` +
    `<input id="password" name="password" type="password" autocomplete="current-password" autofocus required>\n` +
    `<button type="submit">Sign in</button>\n</form>\n</body>\n</html>\n`
  )
}
