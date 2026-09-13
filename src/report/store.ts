/**
 * The report store: where the hosted app keeps a generated report between the
 * timer that makes it and the request that serves it.
 *
 * An Effect service with a deliberately small surface — read and write the
 * scheduled report, read and write a report for a given day, read and write
 * the run status. Two implementations are planned: this in-memory one (tests
 * and local development) and a blob one for Azure, written in the follow-up
 * once the deploy spike lands. Everything above this line is storage-agnostic.
 *
 * Two rules the implementations share:
 *
 * - **A missing entry is not a failure.** Every read returns `null` when
 *   nothing has been stored, so the first request of the day and a cache miss
 *   are ordinary control flow, not exceptions.
 * - **Only resolved day labels reach storage.** The day methods take a
 *   {@link DayRef}, not a string, and a stored report with a malformed
 *   `targetDayLabel` is rejected on the way in.
 */
import { Context, Data, Effect, Layer } from 'effect'
import { dayReportKey, type DayRef, isDayLabel, type RunStatus } from './cacheKey.js'

/** A report as it is stored: both rendered forms, plus what it is and when. */
export interface StoredReport {
  /** The rendered HTML page, before the web chrome wraps it. */
  html: string
  /** The plain-text report. Never contains wa.me links (matches `RenderedReport`). */
  report: string
  /** Resolved `YYYY-MM-DD` the report covers. */
  targetDayLabel: string
  /** When the report was generated — what the stale banner is measured from. */
  generatedAt: Date
}

/** A store operation that failed. `op` names it, as the other modules' errors do. */
export class ReportStoreError extends Data.TaggedError('ReportStoreError')<{
  op: string
  cause: unknown
}> {}

export interface ReportStoreShape {
  /** The report the timer wrote, or `null` before the first successful run. */
  readScheduled: () => Effect.Effect<StoredReport | null, ReportStoreError>
  writeScheduled: (report: StoredReport) => Effect.Effect<void, ReportStoreError>
  /** A report cached under a resolved day key, or `null` on a cache miss. */
  readDay: (day: DayRef) => Effect.Effect<StoredReport | null, ReportStoreError>
  writeDay: (day: DayRef, report: StoredReport) => Effect.Effect<void, ReportStoreError>
  /** The last scheduled run's status, or `null` if it has never run. */
  readRunStatus: () => Effect.Effect<RunStatus | null, ReportStoreError>
  writeRunStatus: (status: RunStatus) => Effect.Effect<void, ReportStoreError>
}

export class ReportStore extends Context.Tag('ReportStore')<
  ReportStore,
  ReportStoreShape
>() {}

/** Starting contents for a store — saves a write in tests. */
export interface ReportStoreSeed {
  scheduled?: StoredReport | null
  /** Keyed by resolved day label, e.g. `{ '2026-09-14': report }`. */
  days?: Record<string, StoredReport>
  runStatus?: RunStatus | null
}

const rejectBadLabel = (op: string, label: string): Effect.Effect<void, ReportStoreError> =>
  isDayLabel(label)
    ? Effect.void
    : Effect.fail(
        new ReportStoreError({
          op,
          cause: `target day label "${label}" is not a resolved YYYY-MM-DD`,
        })
      )

/**
 * The in-memory store: two slots (the scheduled report and the run status) and
 * a map of ad-hoc days, behind the same interface the blob store will have.
 *
 * Copies on the way in and on the way out, so a caller can never reach the
 * stored object and mutate it — the same thing a network round-trip does for
 * free. Nothing here can fail except a rejected day label, which is why the
 * error type is on the interface rather than on this implementation.
 */
export const makeReportStoreMemory = (seed: ReportStoreSeed = {}): ReportStoreShape => {
  let scheduled: StoredReport | null = seed.scheduled ?? null
  let runStatus: RunStatus | null = seed.runStatus ?? null
  const days = new Map<string, StoredReport>(
    Object.entries(seed.days ?? {}).map(([label, report]) => [dayReportKey({ label }), report])
  )

  return {
    readScheduled: () => Effect.sync(() => (scheduled === null ? null : { ...scheduled })),
    writeScheduled: (report) =>
      Effect.gen(function* () {
        yield* rejectBadLabel('store.write-scheduled', report.targetDayLabel)
        scheduled = { ...report }
      }),
    readDay: (day) =>
      Effect.gen(function* () {
        yield* rejectBadLabel('store.read-day', day.label)
        const found = days.get(dayReportKey(day))
        return found === undefined ? null : { ...found }
      }),
    writeDay: (day, report) =>
      Effect.gen(function* () {
        yield* rejectBadLabel('store.write-day', day.label)
        yield* rejectBadLabel('store.write-day', report.targetDayLabel)
        days.set(dayReportKey(day), { ...report })
      }),
    readRunStatus: () => Effect.sync(() => (runStatus === null ? null : { ...runStatus })),
    writeRunStatus: (status) =>
      Effect.gen(function* () {
        yield* rejectBadLabel('store.write-run-status', status.targetDayLabel)
        runStatus = { ...status }
      }),
  }
}

/** A fresh, empty in-memory store — what local development provides. */
export const ReportStoreMemory = Layer.sync(ReportStore, () => makeReportStoreMemory())

/** A store pre-loaded with `seed`, for tests that start from a stored report. */
export const makeReportStoreTest = (seed: ReportStoreSeed = {}): Layer.Layer<ReportStore> =>
  Layer.succeed(ReportStore, ReportStore.of(makeReportStoreMemory(seed)))
