import { describe, expect, it, type TestContext } from 'vitest'
import { Effect, Layer } from 'effect'
import { AppConfigLive, AppConfig } from '../src/effect/AppConfig.js'
import { MbHttpLive, MbHttp } from '../src/effect/MbHttp.js'
import { CurrentUserLive, CurrentUser } from '../src/effect/CurrentUser.js'
import { generateReportEffect } from '../src/effect/generate.js'
import { resolveTargetDay } from '../src/targetDay.js'

// Live Mindbody tests against the sandbox (site -99, `.env.development`).
//
// Opt-in only: `MB_LIVE=1 npx vitest run test/mbLive.spec.ts`. A plain
// `vitest run` skips everything here with no network and no credentials —
// the gate below returns before any layer is built. Nothing in this file
// writes anywhere: token issue + GETs for retrieval, `generateReportEffect`
// for the pipeline, all rendering in memory.
//
// Assertions stick to structure (ids present, header lines, wa.me links)
// rather than exact counts, so sandbox data drift does not break them —
// except the pipeline run itself, which requires at least one appointment
// to prove retrieval end to end.

const AppLayer = AppConfigLive
const HttpLayer = MbHttpLive.pipe(Layer.provide(AppLayer))
const UserLayer = CurrentUserLive.pipe(Layer.provide(Layer.mergeAll(AppLayer, HttpLayer)))
const live = Layer.mergeAll(AppLayer, HttpLayer, UserLayer)

interface LiveSummary {
  siteId: number
  tokenLength: number
  staffCount: number
}

let cached: Promise<LiveSummary> | null = null

/** Build the live layers and prove token + staff retrieval, or skip. Never logs secrets. */
const requireLive = async (ctx: TestContext): Promise<LiveSummary | null> => {
  if (process.env.MB_LIVE !== '1') {
    ctx.skip()
    return null
  }
  try {
    cached ??= Effect.runPromise(
      Effect.gen(function* () {
        const cfg = yield* AppConfig
        const user = yield* CurrentUser
        const http = yield* MbHttp
        const staff = yield* http.get<unknown>('staff/staff', {
          headers: { Authorization: user.token, SiteId: String(cfg.siteId) },
        })
        const list = (staff.data as { StaffMembers?: Array<unknown> }).StaffMembers ?? []
        return { siteId: cfg.siteId, tokenLength: user.token.length, staffCount: list.length }
      }).pipe(Effect.provide(live))
    )
    return await cached
  } catch {
    // No creds, no network, sandbox down: a live test that cannot reach
    // the sandbox skips instead of failing the suite.
    ctx.skip()
    return null
  }
}

describe('mindbody live (site -99)', () => {
  it('issues a token and retrieves the staff list', async (ctx) => {
    const summary = await requireLive(ctx)
    if (summary === null) return
    expect(summary.siteId).toBe(-99)
    expect(summary.tokenLength).toBeGreaterThan(0)
    expect(summary.staffCount).toBeGreaterThan(0)
  }, 60000)

  it('runs the pipeline for tomorrow and renders text + html', async (ctx) => {
    const summary = await requireLive(ctx)
    if (summary === null) return
    const targetDay = resolveTargetDay('tomorrow', new Date())
    const generated = await Effect.runPromise(
      generateReportEffect({ targetDay, invokedAt: new Date() }).pipe(Effect.provide(live))
    )

    // Retrieval: real appointments came back, with the ids the renderers need.
    expect(generated.outputs.length).toBeGreaterThan(0)
    expect(generated.clients.length).toBeGreaterThan(0)
    for (const output of generated.outputs) {
      expect(typeof output.Id).toBe('number')
      expect(typeof output.ClientId).toBe('string')
    }
    for (const client of generated.clients) {
      expect(typeof client.Id).toBe('string')
    }

    // Text report: the DRY RUN header and per-client sections, never wa.me links.
    expect(generated.report).toContain('DRY RUN')
    expect(generated.report).toContain('to send')
    expect(generated.report).not.toContain('wa.me')

    // HTML report: a complete document with cards and click-to-chat links.
    expect(generated.html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(generated.html).toContain('Send via WhatsApp')
    expect(generated.html).toContain('https://wa.me/')
  }, 120000)
})
