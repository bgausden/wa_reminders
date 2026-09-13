import { describe, expect, it } from 'vitest'
import { Effect, Either } from 'effect'
import {
  makeReportStoreTest,
  ReportStore,
  ReportStoreError,
  ReportStoreMemory,
  type StoredReport,
} from '../src/report/store.js'
import { runStatusFailed, runStatusOk } from '../src/report/cacheKey.js'

// Fixed instants and labels: no clock, no timezone dependence.
const GENERATED_AT = new Date(2026, 8, 13, 9, 0, 0)
const DAY = { label: '2026-09-14' }
const OTHER_DAY = { label: '2026-09-15' }

const stored = (over: Partial<StoredReport> = {}): StoredReport => ({
  html: '<!DOCTYPE html>\n<html>\n<body>\n<h1>DRY RUN — 1 to send</h1>\n</body>\n</html>\n',
  report: 'DRY RUN — 1 to send',
  targetDayLabel: DAY.label,
  generatedAt: GENERATED_AT,
  ...over,
})

/** Each call builds its own store, so tests start from empty unless they seed. */
const run = <A>(program: Effect.Effect<A, ReportStoreError, ReportStore>) =>
  Effect.runPromise(program.pipe(Effect.provide(ReportStoreMemory)))

const failure = async <A>(
  program: Effect.Effect<A, ReportStoreError, ReportStore>
): Promise<ReportStoreError> => {
  const result = await Effect.runPromise(
    Effect.either(program.pipe(Effect.provide(ReportStoreMemory)))
  )
  if (Either.isRight(result)) throw new Error('expected the operation to fail')
  return result.left
}

describe('report store (in memory)', () => {
  it('reads nothing back when nothing has been stored', async () => {
    const empty = await run(
      Effect.gen(function* () {
        const store = yield* ReportStore
        return {
          scheduled: yield* store.readScheduled(),
          day: yield* store.readDay(DAY),
          status: yield* store.readRunStatus(),
        }
      })
    )
    // "Not stored yet" is a value, not a failure: the first request of the
    // day and a cache miss are ordinary control flow.
    expect(empty).toEqual({ scheduled: null, day: null, status: null })
  })

  it('round-trips the scheduled report', async () => {
    const report = stored()
    const read = await run(
      Effect.gen(function* () {
        const store = yield* ReportStore
        yield* store.writeScheduled(report)
        return yield* store.readScheduled()
      })
    )
    expect(read).toEqual(report)
    expect(read?.html).toBe(report.html)
    expect(read?.report).toBe(report.report)
    expect(read?.targetDayLabel).toBe('2026-09-14')
    expect(read?.generatedAt).toEqual(GENERATED_AT)
  })

  it('round-trips a report for a day, and a miss on another day is null', async () => {
    const report = stored({ targetDayLabel: OTHER_DAY.label })
    const result = await run(
      Effect.gen(function* () {
        const store = yield* ReportStore
        yield* store.writeDay(OTHER_DAY, report)
        return {
          hit: yield* store.readDay(OTHER_DAY),
          miss: yield* store.readDay(DAY),
        }
      })
    )
    expect(result.hit).toEqual(report)
    expect(result.miss).toBeNull()
  })

  it('keeps an ad-hoc day out of the scheduled slot, and the scheduled list untouched by one', async () => {
    const result = await run(
      Effect.gen(function* () {
        const store = yield* ReportStore
        // The timer runs first: the bookmark has this morning's list.
        yield* store.writeScheduled(stored({ report: 'scheduled list' }))
        // Somebody then generates another day: separate slot, same service.
        yield* store.writeDay(DAY, stored({ report: 'ad-hoc list' }))
        return {
          scheduled: yield* store.readScheduled(),
          day: yield* store.readDay(DAY),
        }
      })
    )
    expect(result.scheduled?.report).toBe('scheduled list')
    expect(result.day?.report).toBe('ad-hoc list')
  })

  it('overwrites in place on a second write', async () => {
    const result = await run(
      Effect.gen(function* () {
        const store = yield* ReportStore
        yield* store.writeScheduled(stored({ report: 'first run' }))
        yield* store.writeScheduled(stored({ report: 'second run', generatedAt: new Date(2026, 8, 14, 9, 0, 0) }))
        yield* store.writeDay(DAY, stored({ report: 'first look' }))
        yield* store.writeDay(DAY, stored({ report: 'regenerated' }))
        return {
          scheduled: yield* store.readScheduled(),
          day: yield* store.readDay(DAY),
        }
      })
    )
    expect(result.scheduled?.report).toBe('second run')
    expect(result.scheduled?.generatedAt).toEqual(new Date(2026, 8, 14, 9, 0, 0))
    expect(result.day?.report).toBe('regenerated')
  })

  it('round-trips the run status, keeping the error text of a failed run', async () => {
    const result = await run(
      Effect.gen(function* () {
        const store = yield* ReportStore
        yield* store.writeRunStatus(runStatusOk(GENERATED_AT, DAY))
        const ok = yield* store.readRunStatus()
        yield* store.writeRunStatus(
          runStatusFailed(new Date(2026, 8, 14, 9, 0, 0), OTHER_DAY, 'Mindbody timed out')
        )
        return { ok, failed: yield* store.readRunStatus() }
      })
    )
    expect(result.ok).toEqual({
      generatedAt: GENERATED_AT,
      targetDayLabel: '2026-09-14',
      success: true,
      error: null,
    })
    expect(result.failed?.success).toBe(false)
    expect(result.failed?.error).toBe('Mindbody timed out')
    expect(result.failed?.generatedAt).toEqual(new Date(2026, 8, 14, 9, 0, 0))
  })

  it('rejects a report whose target day was never resolved', async () => {
    // The point of taking a day object rather than a string: an unparsed
    // "tomorrow" cannot be filed as if it were a day.
    const writeScheduled = await failure(
      Effect.flatMap(ReportStore, (store) =>
        store.writeScheduled(stored({ targetDayLabel: 'tomorrow' }))
      )
    )
    expect(writeScheduled).toBeInstanceOf(ReportStoreError)
    expect(writeScheduled._tag).toBe('ReportStoreError')
    // The operation is named in the error, as the other modules do.
    expect(writeScheduled.op).toBe('store.write-scheduled')

    const writeDay = await failure(
      Effect.flatMap(ReportStore, (store) => store.writeDay({ label: '+1' }, stored()))
    )
    expect(writeDay.op).toBe('store.write-day')

    const readDay = await failure(
      Effect.flatMap(ReportStore, (store) => store.readDay({ label: '14 Sep 2026' }))
    )
    expect(readDay.op).toBe('store.read-day')

    const writeStatus = await failure(
      Effect.flatMap(ReportStore, (store) =>
        store.writeRunStatus(runStatusOk(GENERATED_AT, { label: 'soon' }))
      )
    )
    expect(writeStatus.op).toBe('store.write-run-status')
  })

  it('hands back a copy, so a caller cannot reach the stored report', async () => {
    const read = await run(
      Effect.gen(function* () {
        const store = yield* ReportStore
        yield* store.writeScheduled(stored())
        const first = yield* store.readScheduled()
        if (first !== null) first.html = 'tampered'
        return yield* store.readScheduled()
      })
    )
    // What the blob store gets for free from the network round-trip.
    expect(read?.html).toContain('DRY RUN — 1 to send')
  })

  it('starts empty each time it is provided', async () => {
    const write = await run(
      Effect.flatMap(ReportStore, (store) => store.writeScheduled(stored()))
    )
    expect(write).toBeUndefined()
    const inAnotherProcess = await run(
      Effect.flatMap(ReportStore, (store) => store.readScheduled())
    )
    expect(inAnotherProcess).toBeNull()
  })

  it('can be seeded with what a previous run left behind', async () => {
    const scheduled = stored({ report: 'yesterday morning' })
    const dayReport = stored({ report: 'Monday, made on Friday' })
    const status = runStatusFailed(GENERATED_AT, DAY, 'Mindbody 500')
    const seeded = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* ReportStore
        return {
          scheduled: yield* store.readScheduled(),
          day: yield* store.readDay(DAY),
          missingDay: yield* store.readDay(OTHER_DAY),
          status: yield* store.readRunStatus(),
        }
      }).pipe(
        Effect.provide(
          makeReportStoreTest({ scheduled, days: { [DAY.label]: dayReport }, runStatus: status })
        )
      )
    )
    expect(seeded.scheduled).toEqual(scheduled)
    expect(seeded.day).toEqual(dayReport)
    expect(seeded.missingDay).toBeNull()
    expect(seeded.status).toEqual(status)
  })
})
