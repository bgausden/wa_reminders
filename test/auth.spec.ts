import { describe, expect, it } from 'vitest'
import {
  issueSession,
  loginPage,
  SESSION_COOKIE_NAME,
  SESSION_LIFETIME_MS,
  SESSION_MAX_AGE_SECONDS,
  sessionCookie,
  verifySession,
} from '../src/web/auth.js'

const PASSWORD = 'correct horse battery staple'
// Fixed "now": Sunday 13 September 2026, 09:00 local.
const NOW = new Date(2026, 8, 13, 9, 0, 0)

describe('issueSession', () => {
  it('issues a value that verifies against the same password', () => {
    const { value, expiresAt } = issueSession(PASSWORD, NOW)
    expect(verifySession(value, PASSWORD, NOW)).toBe(true)
    expect(expiresAt.getTime()).toBe(NOW.getTime() + SESSION_LIFETIME_MS)
  })

  it('encodes nothing in the clear', () => {
    const { value, expiresAt } = issueSession(PASSWORD, NOW)
    expect(value).not.toContain(PASSWORD)
    expect(value).not.toContain(String(expiresAt.getTime()))
    // Two dot-separated parts: signed payload plus its signature.
    expect(value.split('.')).toHaveLength(2)
  })

  it('issues a different value once the expiry moves on', () => {
    const later = new Date(NOW.getTime() + 60_000)
    const first = issueSession(PASSWORD, NOW)
    const second = issueSession(PASSWORD, later)
    expect(second.value).not.toBe(first.value)
    expect(verifySession(second.value, PASSWORD, later)).toBe(true)
    // The old value still verifies: it expires on its own schedule.
    expect(verifySession(first.value, PASSWORD, later)).toBe(true)
  })

  it('refuses to issue sessions when the app setting is blank', () => {
    expect(() => issueSession('', NOW)).toThrow(/blank/)
  })
})

describe('verifySession', () => {
  it('accepts a session right up to its expiry and rejects it from that instant', () => {
    const { value, expiresAt } = issueSession(PASSWORD, NOW)
    const justBefore = new Date(expiresAt.getTime() - 1)
    expect(verifySession(value, PASSWORD, justBefore)).toBe(true)
    expect(verifySession(value, PASSWORD, expiresAt)).toBe(false)
    expect(verifySession(value, PASSWORD, new Date(expiresAt.getTime() + 1))).toBe(false)
    // Long expired: a cookie from a previous month is just logged out.
    expect(verifySession(value, PASSWORD, new Date(2026, 11, 25))).toBe(false)
  })

  it('accepts a session issued in the past and presented now', () => {
    const { value } = issueSession(PASSWORD, NOW)
    const twentyNineDaysLater = new Date(NOW.getTime() + 29 * 24 * 60 * 60 * 1000)
    expect(verifySession(value, PASSWORD, twentyNineDaysLater)).toBe(true)
  })

  it('rejects a session signed with a different password', () => {
    const { value } = issueSession(PASSWORD, NOW)
    expect(verifySession(value, 'another password', NOW)).toBe(false)
    expect(verifySession(value, `${PASSWORD} `, NOW)).toBe(false)
    expect(verifySession(value, '', NOW)).toBe(false)
  })

  it('rejects a tampered expiry — the session cannot extend itself', () => {
    const { value } = issueSession(PASSWORD, NOW)
    const signature = value.split('.')[1] as string
    const extendedExpiry = Buffer.from(String(new Date(2027, 0, 1).getTime()), 'utf8').toString(
      'base64url'
    )
    const forged = `${extendedExpiry}.${signature}`
    expect(verifySession(forged, PASSWORD, NOW)).toBe(false)
    // ...and the genuine one with its expiry edited a digit at a time.
    const payload = value.split('.')[0] as string
    expect(verifySession(`${payload}X.${signature}`, PASSWORD, NOW)).toBe(false)
    expect(verifySession(`${payload.slice(0, -1)}.${signature}`, PASSWORD, NOW)).toBe(false)
  })

  it('rejects a tampered signature', () => {
    const { value } = issueSession(PASSWORD, NOW)
    const payload = value.split('.')[0] as string
    const signature = value.split('.')[1] as string
    const flipped = `${signature.slice(0, -1)}${signature.slice(-1) === 'A' ? 'B' : 'A'}`
    expect(verifySession(`${payload}.${flipped}`, PASSWORD, NOW)).toBe(false)
    expect(verifySession(`${payload}.${signature.slice(0, -1)}`, PASSWORD, NOW)).toBe(false)
    expect(verifySession(`${payload}.AAAA`, PASSWORD, NOW)).toBe(false)
  })

  it('rejects malformed values without throwing', () => {
    const { value } = issueSession(PASSWORD, NOW)
    const hostile: Array<string | null | undefined> = [
      '',
      '   ',
      '.',
      '..',
      `${value}.`,
      `.${value}`,
      'a.b.c',
      `${value}.extra`,
      'not base64!!.nor-this!!',
      `${value} `,
      ` ${value}`,
      `${value}\n`,
      'undefined',
      'null',
      '....',
      null,
      undefined,
    ]
    for (const presented of hostile) {
      expect(verifySession(presented, PASSWORD, NOW), `value: ${String(presented)}`).toBe(false)
    }
  })

  it('rejects a value whose payload is not an expiry', () => {
    // Well-formed base64url on both sides of the dot, nonsense inside.
    const junk = Buffer.from('let me in', 'utf8').toString('base64url')
    expect(verifySession(`${junk}.${junk}`, PASSWORD, NOW)).toBe(false)
  })
})

describe('sessionCookie', () => {
  it('sets the session on / with HttpOnly, Secure, SameSite=Lax and the session max-age', () => {
    const { value } = issueSession(PASSWORD, NOW)
    const cookie = sessionCookie(value)
    expect(cookie).toBe(
      `${SESSION_COOKIE_NAME}=${value}; Max-Age=${SESSION_MAX_AGE_SECONDS}; ` +
        `Path=/; HttpOnly; Secure; SameSite=Lax`
    )
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    // The browser lifetime matches the session lifetime the server enforces.
    expect(SESSION_MAX_AGE_SECONDS).toBe(SESSION_LIFETIME_MS / 1000)
    expect(SESSION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60)
  })
})

describe('loginPage', () => {
  it('renders a complete password form that posts to the same URL', () => {
    const page = loginPage()
    expect(page.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(page).toContain('<html lang="en">')
    expect(page.trimEnd().endsWith('</html>')).toBe(true)
    // Empty action: the form posts back to whatever URL served it.
    expect(page).toContain('<form method="post" action="">')
    expect(page).toContain('type="password"')
    expect(page).toContain('name="password"')
    expect(page).toContain('<button type="submit">')
    expect(page).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">')
    expect(page).not.toContain('<script')
  })

  it('renders the message when one is given, escaped', () => {
    const page = loginPage('Wrong password')
    expect(page).toContain('Wrong password')
    expect(page).toContain('<p class="message">Wrong password</p>')

    const hostile = loginPage('<script>alert("x")</script>')
    expect(hostile).not.toContain('<script>')
    expect(hostile).toContain('&lt;script&gt;')
    expect(hostile).toContain('&quot;x&quot;')
  })

  it('renders no message when there is none', () => {
    for (const message of [undefined, null, '', '   ']) {
      const page = loginPage(message)
      expect(page, `message: ${String(message)}`).not.toContain('class="message"')
      expect(page).not.toContain('Wrong password')
      expect(page).toContain('<form method="post" action="">')
    }
  })
})
