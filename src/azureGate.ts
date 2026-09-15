/**
 * Azure adapter for the access gate: deliberately shallow wiring only.
 *
 * Translates a platform request into a {@link GateRequest}, lets
 * `src/web/gate.ts` decide, and translates the decision back. No domain
 * logic lives here — the password comes from the `REPORT_PASSWORD` app
 * setting at request time (never module load, so a rotated setting takes
 * effect without a restart), and nothing secret is ever logged.
 */
import type { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { loginPage, sessionCookie } from './web/auth.js'
import { decideGate } from './web/gate.js'

const html = (status: number, page: string): HttpResponseInit => ({
  status,
  headers: { 'Content-Type': 'text/html; charset=utf-8' },
  body: page,
})

/** Put the gate in front of `inner`: unauthenticated traffic never reaches it. */
export function createGatedHandler(inner: HttpHandler): HttpHandler {
  return async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const password = process.env.REPORT_PASSWORD ?? ''
    let body = ''
    if (request.method.toUpperCase() === 'POST') {
      try {
        body = await request.text()
      } catch {
        body = ''
      }
    }
    const decision = decideGate(
      {
        method: request.method,
        cookieHeader: request.headers.get('cookie'),
        contentType: request.headers.get('content-type'),
        body,
      },
      password,
      new Date()
    )
    switch (decision.kind) {
      case 'serve':
        return inner(request, context)
      case 'grant':
        return {
          status: 302,
          headers: {
            Location: '/',
            'Set-Cookie': sessionCookie(decision.sessionValue),
          },
          body: '',
        }
      case 'login': {
        if (decision.status === 500) {
          context.error('auth gate: REPORT_PASSWORD is blank or missing')
        }
        return html(decision.status, loginPage(decision.message))
      }
    }
  }
}
