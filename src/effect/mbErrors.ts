import axios from 'axios'
import { Data } from 'effect'

// Lesson 1: replace `Promise.reject(string)` with typed errors.
// The left side of `Effect<T, E>` forces callers to handle `E`.
export class MissingTokenError extends Data.TaggedError('MissingTokenError')<{
  op: string
}> {}

export class MindbodyError extends Data.TaggedError('MindbodyError')<{
  op: string
  cause: unknown
}> {}

// Mindbody answers failures with `{ Error: { Message, Code } }` in the
// response body — e.g. DeniedAccess names the blocked calling IP. Unwrap
// to the axios error and keep only message + status + that response body.
// Request config is never logged: headers carry the Api-Key (#16) and the
// request body can carry the owner password (#17).
export const summarizeCause = (cause: unknown): unknown => {
  const raw = cause instanceof MindbodyError ? cause.cause : cause
  if (axios.isAxiosError(raw)) {
    return {
      message: raw.message,
      status: raw.response?.status,
      data: raw.response?.data,
    }
  }
  return cause
}

/**
 * Plain-language text for a Mindbody response body: surfaces
 * `Error.Message`/`Error.Code` when the body has that shape, string-only
 * so nothing unexpected reaches the page or the logs. Returns null for
 * anything else (caller falls back to the axios message).
 */
export const mbErrorText = (data: unknown): string | null => {
  if (typeof data !== 'object' || data === null) return null
  const err = (data as Record<string, unknown>).Error
  if (typeof err !== 'object' || err === null) return null
  const rec = err as Record<string, unknown>
  if (typeof rec.Message !== 'string' || rec.Message.length === 0) return null
  const code = typeof rec.Code === 'string' && rec.Code.length > 0 ? ` [${rec.Code}]` : ''
  return `${rec.Message}${code}`
}

// File/template failures in the dry-run reporter. Kept separate from
// MindbodyError so the edge can report "API failed" vs "local I/O failed".
export class DryRunError extends Data.TaggedError('DryRunError')<{
  op: string
  cause: unknown
}> {}
