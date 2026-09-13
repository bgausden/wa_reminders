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
