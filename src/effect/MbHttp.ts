import axios, { type AxiosInstance } from 'axios'
import https from 'node:https'
import { Context, Effect, Layer, Schedule } from 'effect'
import { AppConfig } from './AppConfig.js'
import { MindbodyError, summarizeCause } from './mbErrors.js'

export interface MbHttpShape {
  get: <T>(
    path: string,
    opts?: { params?: unknown; headers?: Record<string, string> }
  ) => Effect.Effect<{ data: T }, MindbodyError>
  post: <T>(
    path: string,
    body?: unknown,
    opts?: { headers?: Record<string, string> }
  ) => Effect.Effect<{ data: T }, MindbodyError>
  raw: AxiosInstance
}

export class MbHttp extends Context.Tag('MbHttp')<MbHttp, MbHttpShape>() {}

// Test-friendly retry: transient MB failures back off exponentially,
// capped at 2 retries. Exported so tests can substitute
// Schedule.recurs(0) (no delay) or drive it with TestClock instead of
// waiting on real delays. Test doubles bypass this entirely (no retry).
export const mbRetrySchedule = Schedule.intersect(
  Schedule.exponential('100 millis'),
  Schedule.recurs(2)
)

// Lesson 9: one axios instance per layer. Api-Key/SiteId come from
// config; Authorization is passed per-request (fixes the stale-token
// bug in httpClient.ts where it was baked at import time).
export const MbHttpLive = Layer.effect(
  MbHttp,
  Effect.gen(function* () {
    const cfg = yield* AppConfig
    const raw = axios.create({
      baseURL: cfg.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': cfg.apiKey,
        SiteId: cfg.siteId,
      },
      maxBodyLength: Infinity,
      httpsAgent: new https.Agent({ keepAlive: true }),
    })
    const wrap = <T>(op: string, path: string, thunk: () => Promise<{ data: T }>) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('mb.http request', { op, path })
        return yield* Effect.tryPromise({
          try: thunk,
          catch: (cause) => new MindbodyError({ op, cause }),
        }).pipe(Effect.retry(mbRetrySchedule))
      }).pipe(
        Effect.tapError((cause) => Effect.logError('mb.http error', { op, path, cause: summarizeCause(cause) })),
        Effect.withLogSpan('mb.http'),
        Effect.annotateLogs({ op, path })
      )
    return MbHttp.of({
      get: (path, opts) => wrap(`GET ${path}`, path, () => raw.get(path, opts)),
      post: (path, body, opts) => wrap(`POST ${path}`, path, () => raw.post(path, body, opts)),
      raw,
    })
  })
)

// Test double: record calls, return canned data, no network, no retry.
export const makeMbHttpTest = (handler: (path: string) => unknown) =>
  Layer.succeed(
    MbHttp,
    MbHttp.of({
      get: <T>(path: string) => Effect.succeed({ data: handler(path) as T }),
      post: <T>(path: string) => Effect.succeed({ data: handler(path) as T }),
      raw: {} as AxiosInstance,
    })
  )
