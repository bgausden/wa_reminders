import { describe, expect, it, afterEach } from 'vitest'
import { issueSession, verifySession } from '../src/web/auth.js'
import {
  decideGate,
  MISSING_PASSWORD_MESSAGE,
  passwordsEqual,
  passwordFromBody,
  sessionFromCookieHeader,
  WRONG_PASSWORD_MESSAGE,
  type GateRequest,
} from '../src/web/gate.js'
import { createGatedHandler } from '../src/azureGate.js'

const PASSWORD = 'correct horse battery staple'
// Fixed "now": Sunday 13 September 2026, 09:00 local.
const NOW = new Date(2026, 8, 13, 9, 0, 0)

const get = (cookieHeader: string | null = null): GateRequest => ({
  method: 'GET',
  cookieHeader,
  contentType: null,
  body: '',
})

const post = (body: string, contentType = 'application/x-www-form-urlencoded'): GateRequest => ({
  method: 'POST',
  cookieHeader: null,
  contentType,
  body,
})

const cookieHeaderFor = (value: string): string => `other=1; wa_session=${value}; theme=dark`

describe('decideGate', () => {
  it('serves a request carrying a valid session, GET or POST', () => {
    const { value } = issueSession(PASSWORD, NOW)
    expect(decideGate(get(cookieHeaderFor(value)), PASSWORD, NOW)).toEqual({ kind: 'serve' })
    expect(
      decideGate({ ...post('password=nope'), cookieHeader: cookieHeaderFor(value) }, PASSWORD, NOW)
    ).toEqual({ kind: 'serve' })
  })

  it('returns the plain login form for an anonymous GET', () => {
    expect(decideGate(get(), PASSWORD, NOW)).toEqual({ kind: 'login', status: 200, message: null })
  })

  it('treats an expired or tampered cookie as logged out, not an error', () => {
    const { value, expiresAt } = issueSession(PASSWORD, NOW)
    const afterExpiry = new Date(expiresAt.getTime() + 1)
    expect(decideGate(get(cookieHeaderFor(value)), PASSWORD, afterExpiry)).toEqual({
      kind: 'login',
      status: 200,
      message: null,
    })
    const payload = value.split('.')[0] as string
    expect(decideGate(get(cookieHeaderFor(`${payload}.AAAA`)), PASSWORD, NOW)).toEqual({
      kind: 'login',
      status: 200,
      message: null,
    })
  })

  it('grants a session that verifies when the POST carries the password', () => {
    const params = new URLSearchParams({ password: PASSWORD }).toString()
    const decision = decideGate(post(params), PASSWORD, NOW)
    expect(decision.kind).toBe('grant')
    if (decision.kind !== 'grant') return
    expect(verifySession(decision.sessionValue, PASSWORD, NOW)).toBe(true)
  })

  it('re-renders the form with a message when the password is wrong', () => {
    const decision = decideGate(post('password=nope'), PASSWORD, NOW)
    expect(decision).toEqual({ kind: 'login', status: 401, message: WRONG_PASSWORD_MESSAGE })
  })

  it('asks for the password when the POST carries none', () => {
    for (const body of ['', 'password=', 'other=1']) {
      const decision = decideGate(post(body), PASSWORD, NOW)
      expect(decision, `body: ${body}`).toEqual({
        kind: 'login',
        status: 200,
        message: MISSING_PASSWORD_MESSAGE,
      })
    }
  })

  it('ignores a body that is not a url-encoded form', () => {
    const decision = decideGate(post('{"password":"x"}', 'application/json'), PASSWORD, NOW)
    expect(decision).toEqual({ kind: 'login', status: 200, message: MISSING_PASSWORD_MESSAGE })
  })

  it('fails closed when the app setting is blank: nothing is served or granted', () => {
    expect(decideGate(get(), '', NOW).kind).toBe('login')
    const attempt = decideGate(post(new URLSearchParams({ password: PASSWORD }).toString()), '', NOW)
    expect(attempt.kind).toBe('login')
    if (attempt.kind === 'login') expect(attempt.status).toBe(500)
    // Even a previously valid session stops working once the setting is blank.
    const { value } = issueSession(PASSWORD, NOW)
    expect(decideGate(get(cookieHeaderFor(value)), '', NOW).kind).toBe('login')
  })
})

describe('passwordsEqual', () => {
  it('accepts the password and rejects anything else in constant time', () => {
    expect(passwordsEqual(PASSWORD, PASSWORD)).toBe(true)
    expect(passwordsEqual('wrong', PASSWORD)).toBe(false)
    expect(passwordsEqual(`${PASSWORD} `, PASSWORD)).toBe(false)
    expect(passwordsEqual('short', 'a much longer password')).toBe(false)
    expect(passwordsEqual('', PASSWORD)).toBe(false)
    expect(passwordsEqual(PASSWORD, '')).toBe(false)
  })
})

describe('sessionFromCookieHeader', () => {
  it('finds the session among other cookies', () => {
    const { value } = issueSession(PASSWORD, NOW)
    expect(sessionFromCookieHeader(cookieHeaderFor(value))).toBe(value)
    expect(sessionFromCookieHeader(`wa_session=${value}`)).toBe(value)
  })

  it('returns null when the cookie is absent', () => {
    for (const header of [null, '', 'other=1', 'wa_session=', 'wa_session ']) {
      expect(sessionFromCookieHeader(header), `header: ${String(header)}`).toBe(null)
    }
  })
})

describe('passwordFromBody', () => {
  it('reads the password field, url-decoded', () => {
    const body = new URLSearchParams({ password: 'p@ss word', other: '1' }).toString()
    expect(passwordFromBody(body, 'application/x-www-form-urlencoded')).toBe('p@ss word')
    expect(passwordFromBody(body, 'application/x-www-form-urlencoded; charset=UTF-8')).toBe(
      'p@ss word'
    )
  })

  it('returns null for a missing field or a non-form body', () => {
    expect(passwordFromBody('', 'application/x-www-form-urlencoded')).toBe(null)
    expect(passwordFromBody('other=1', 'application/x-www-form-urlencoded')).toBe(null)
    expect(passwordFromBody('password=x', 'application/json')).toBe(null)
  })
})

describe('createGatedHandler', () => {
  const previous = process.env.REPORT_PASSWORD
  afterEach(() => {
    if (previous === undefined) delete process.env.REPORT_PASSWORD
    else process.env.REPORT_PASSWORD = previous
  })

  const stubContext = () => ({ error: () => {} }) as unknown as Parameters<
    ReturnType<typeof createGatedHandler>
  >[1]

  const stubRequest = (init: {
    method?: string
    cookie?: string | null
    contentType?: string | null
    body?: string
  }) =>
    ({
      method: init.method ?? 'GET',
      url: 'https://example.test/',
      headers: {
        get: (name: string): string | null => {
          if (name.toLowerCase() === 'cookie') return init.cookie ?? null
          if (name.toLowerCase() === 'content-type') return init.contentType ?? null
          return null
        },
      },
      text: async (): Promise<string> => init.body ?? '',
    }) as unknown as Parameters<ReturnType<typeof createGatedHandler>>[0]

  const inner = (async () => ({
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: '<p>protected</p>',
  })) as unknown as Parameters<typeof createGatedHandler>[0]

  it('serves the login form anonymously and the content with a session', async () => {
    process.env.REPORT_PASSWORD = PASSWORD
    const handler = createGatedHandler(inner)
    const anonymous = await handler(stubRequest({}), stubContext())
    expect(anonymous.status).toBe(200)
    expect(anonymous.body).toContain('<form method="post" action="">')
    expect(anonymous.body).not.toContain('protected')

    const { value } = issueSession(PASSWORD, NOW)
    const served = await handler(
      stubRequest({ cookie: `wa_session=${value}` }),
      stubContext()
    )
    expect(served.status).toBe(200)
    expect(served.body).toContain('protected')
  })

  it('sets the session cookie and redirects on the correct password', async () => {
    process.env.REPORT_PASSWORD = PASSWORD
    const handler = createGatedHandler(inner)
    const body = new URLSearchParams({ password: PASSWORD }).toString()
    const granted = await handler(stubRequest({ method: 'POST', body }), stubContext())
    expect(granted.status).toBe(302)
    const setCookie = (granted.headers as Record<string, string>)['Set-Cookie']
    expect(setCookie).toContain('wa_session=')
    expect(setCookie).toContain('HttpOnly')
    const issued = setCookie.slice('wa_session='.length).split(';')[0] as string
    expect(verifySession(issued, PASSWORD)).toBe(true)
  })

  it('never reaches the inner handler when the password is blank', async () => {
    process.env.REPORT_PASSWORD = ''
    const handler = createGatedHandler(inner)
    const response = await handler(stubRequest({}), stubContext())
    expect(response.status).toBe(500)
    expect(response.body).not.toContain('protected')
  })
})
