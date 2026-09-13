import { Config, Context, Effect, Layer } from 'effect'
import dotenv from 'dotenv'

// Load .env (no crash if missing). Missing vars surface as typed
// ConfigError when the layer is built — compare with envvars.ts which
// throws zod errors at import time.
dotenv.config()

export interface AppConfigShape {
  apiKey: string
  siteId: number
  username: string
  password: string
  baseUrl: string
}

export class AppConfig extends Context.Tag('AppConfig')<AppConfig, AppConfigShape>() {}

// Lesson 8: config is an Effect. Each field declares its env var and
// failure mode instead of `z.object().parse(process.env)` at import.
const loadConfig = Effect.gen(function* () {
  const apiKey = yield* Config.string('API_KEY')
  const siteId = yield* Config.integer('SITE_ID')
  const username = yield* Config.string('MB_USERNAME')
  const password = yield* Config.string('MB_PASSWORD')
  const baseUrl = yield* Config.string('MB_BASE_URL').pipe(
    Config.withDefault('https://api.mindbodyonline.com/public/v6')
  )
  return { apiKey, siteId, username, password, baseUrl }
})

export const AppConfigLive = Layer.effect(AppConfig, loadConfig)

// Tests never touch process.env — provide this instead.
export const AppConfigTest = Layer.succeed(AppConfig, {
  apiKey: 'test-key',
  siteId: 1,
  username: 'u',
  password: 'p',
  baseUrl: 'https://example.test',
})
