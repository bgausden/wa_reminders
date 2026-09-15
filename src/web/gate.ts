/**
 * Access gate for the hosted page: pure request/response decision logic.
 *
 * Azure-free on purpose — the HTTP adapter (`src/azureGate.ts`) translates a
 * platform request into a {@link GateRequest} and a decision back into a
 * platform response, so everything here is unit-testable with plain objects.
 *
 * Rules:
 *
 * - The shared password is always an argument (an app setting at the edge).
 *   A blank one fails closed: every request gets the login page and nothing
 *   is ever granted.
 * - A request carrying a valid session cookie is served, whatever the method.
 * - Anything else gets the login form. An expired or tampered cookie is just
 *   "logged out" — a plain form, not an error — while a wrong password
 *   re-renders the form with a message.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { issueSession, SESSION_COOKIE_NAME, verifySession } from './auth.js'

/** The smallest piece of an HTTP request the gate needs to decide. */
export interface GateRequest {
  method: string
  /** Raw `Cookie` header, or null when absent. */
  cookieHeader: string | null | undefined
  /** Raw `Content-Type` header, or null when absent. */
  contentType: string | null | undefined
  /** Raw request body text (`''` when there is none or it could not be read). */
  body: string
}

export type GateDecision =
  /** Serve the protected content. */
  | { kind: 'serve' }
  /** Serve the login form with this status and message (`null` = no message). */
  | { kind: 'login'; status: 200 | 401 | 500; message: string | null }
  /** The password checked out: set this session value as a cookie. */
  | { kind: 'grant'; sessionValue: string }

export const WRONG_PASSWORD_MESSAGE = 'Wrong password, try again.'
export const MISSING_PASSWORD_MESSAGE = 'Enter the password to sign in.'
const UNAVAILABLE_MESSAGE = 'Sign-in is temporarily unavailable.'

/**
 * Constant-time password comparison. Both sides are hashed first so inputs
 * of different lengths reject without leaking the length, and empty input
 * never matches — a blank form field is "missing", not "wrong".
 */
export function passwordsEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a === '' || b === '') return false
  const left = createHash('sha256').update(a, 'utf8').digest()
  const right = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(left, right)
}

/** The session value carried by a `Cookie` header, or null when absent. */
export function sessionFromCookieHeader(header: string | null | undefined): string | null {
  if (typeof header !== 'string' || header === '') return null
  const prefix = `${SESSION_COOKIE_NAME}=`
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix) && trimmed.length > prefix.length) {
      return trimmed.slice(prefix.length)
    }
  }
  return null
}

/**
 * The `password` field of a url-encoded form body, or null when there is
 * none — wrong content type, unparseable body, or field missing/blank.
 */
export function passwordFromBody(body: string, contentType: string | null | undefined): string | null {
  if (typeof contentType === 'string' && contentType !== '') {
    if (!contentType.toLowerCase().includes('application/x-www-form-urlencoded')) return null
  }
  let presented: string | null = null
  try {
    presented = new URLSearchParams(body).get('password')
  } catch {
    return null
  }
  return typeof presented === 'string' && presented !== '' ? presented : null
}

/**
 * Allow, challenge, or grant. Holds no state — pass `now` so tests can pin
 * the clock; the adapter passes the clock at call time.
 */
export function decideGate(
  request: GateRequest,
  password: string,
  now: Date = new Date()
): GateDecision {
  // Fail closed: no password configured means nobody gets in, and the page
  // says so rather than accepting anything.
  if (password === '') {
    return { kind: 'login', status: 500, message: UNAVAILABLE_MESSAGE }
  }
  // A valid session serves, whatever the method — a signed-in browser that
  // re-posts the form is still signed in.
  const presented = sessionFromCookieHeader(request.cookieHeader)
  if (presented !== null && verifySession(presented, password, now)) {
    return { kind: 'serve' }
  }
  // No session: only a POST carrying the password can grant one.
  if (request.method.toUpperCase() === 'POST') {
    const attempt = passwordFromBody(request.body, request.contentType)
    if (attempt === null) {
      return { kind: 'login', status: 200, message: MISSING_PASSWORD_MESSAGE }
    }
    if (passwordsEqual(attempt, password)) {
      return { kind: 'grant', sessionValue: issueSession(password, now).value }
    }
    return { kind: 'login', status: 401, message: WRONG_PASSWORD_MESSAGE }
  }
  // Logged out (or expired/tampered): the plain form, not an error.
  return { kind: 'login', status: 200, message: null }
}
