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

// Axios errors carry sockets and circular refs — summarize to status +
// body (never headers) before logging.
export const summarizeCause = (cause: unknown): unknown => {
  if (axios.isAxiosError(cause)) {
    return {
      message: cause.message,
      status: cause.response?.status,
      data: cause.response?.data,
    }
  }
  return cause
}

// File/template failures in the dry-run reporter. Kept separate from
// MindbodyError so the edge can report "API failed" vs "local I/O failed".
export class DryRunError extends Data.TaggedError('DryRunError')<{
  op: string
  cause: unknown
}> {}
