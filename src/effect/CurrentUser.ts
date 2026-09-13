import { Context, Effect, Layer } from 'effect'
import { AppConfig } from './AppConfig.js'
import { MbHttp } from './MbHttp.js'
import { USER_TOKEN_ENDPOINT } from '../mb_endpoints.js'
import { decodeOrMindbody, TokenResponseSchema } from './MbSchemas.js'
import { MindbodyError, MissingTokenError } from './mbErrors.js'

export interface CurrentUserShape {
  userName: string
  password: string
  siteId: number
  token: string
}

export class CurrentUser extends Context.Tag('CurrentUser')<
  CurrentUser,
  CurrentUserShape
>() {}

// Lesson 10: login is a layer. Needs config + http, yields an
// authenticated user. No `User._defaultUser` global, no import cycle.
export const CurrentUserLive = Layer.effect(
  CurrentUser,
  Effect.gen(function* () {
    const cfg = yield* AppConfig
    const http = yield* MbHttp
    const res = yield* http.post<unknown>(
      USER_TOKEN_ENDPOINT,
      { Username: cfg.username, Password: cfg.password },
      { headers: { SiteId: String(cfg.siteId) } }
    )
    // Lesson 13: presence validated by Schema, non-empty by check.
    const decoded = yield* decodeOrMindbody(
      TokenResponseSchema,
      res.data,
      'POST usertoken/issue'
    )
    if (decoded.AccessToken.length === 0) {
      return yield* Effect.fail(
        new MindbodyError({ op: 'POST usertoken/issue', cause: 'AccessToken empty' })
      )
    }
    return CurrentUser.of({
      userName: cfg.username,
      password: cfg.password,
      siteId: cfg.siteId,
      token: decoded.AccessToken,
    })
  })
)

export const CurrentUserTest = Layer.succeed(
  CurrentUser,
  CurrentUser.of({ userName: 'u', password: 'p', siteId: 1, token: 'token' })
)

// Helper for ops that cannot proceed without a token.
export const requireToken = Effect.flatMap(CurrentUser, (u) =>
  u.token
    ? Effect.succeed(u)
    : Effect.fail(new MissingTokenError({ op: 'CurrentUser' }))
)
