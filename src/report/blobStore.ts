/**
 * Blob implementation of the report store: the Azure edge of `src/report/store.ts`.
 *
 * Deliberately shallow wiring only — key layout comes from
 * `src/report/cacheKey.ts`, validation from the store interface contract, and
 * no domain logic lives here. The only Azure import in the repo outside the
 * other thin adapters (`src/azure*.ts`) lives in this module.
 *
 * Connection: the `AzureWebJobsStorage` app setting, which already exists on
 * every Function app, so there is no new secret to provision. It is read
 * inside each operation (not at module load), so a rotated connection takes
 * effect without a restart — the same per-request discipline as the auth
 * gate's `REPORT_PASSWORD` read. The container (`reports`) stays private:
 * blobs are only ever read through the authenticated function, never by URL.
 *
 * Reads return `null` when nothing has been stored (the interface contract);
 * corrupt or unparsable blobs fail as `ReportStoreError`, since that is a
 * real problem rather than an empty slot.
 */
import { BlobServiceClient } from '@azure/storage-blob'
import { Effect, Layer } from 'effect'
import {
  dayReportKey,
  isDayLabel,
  RUN_STATUS_KEY,
  SCHEDULED_REPORT_KEY,
  type DayRef,
  type RunStatus,
} from './cacheKey.js'
import { ReportStore, ReportStoreError, type StoredReport } from './store.js'

/** The private container holding the scheduled report, day cache and run status. */
export const REPORTS_CONTAINER = 'reports'

/**
 * App setting carrying the storage connection string. `AzureWebJobsStorage`
 * is provisioned on the Function app itself, so the timer and the HTTP
 * handler share it with the platform rather than adding another secret.
 */
export const STORAGE_CONNECTION_ENV = 'AzureWebJobsStorage'

const toStoreError = (op: string, cause: unknown) => new ReportStoreError({ op, cause })

const connectionString = (op: string): Effect.Effect<string, ReportStoreError> =>
  Effect.gen(function* () {
    const value = process.env[STORAGE_CONNECTION_ENV] ?? ''
    if (value === '') {
      return yield* Effect.fail(
        toStoreError(op, `${STORAGE_CONNECTION_ENV} app setting is blank or missing`)
      )
    }
    return value
  })

const isMissing = (cause: unknown): boolean => {
  const status = (cause as { statusCode?: unknown })?.statusCode
  const code = (cause as { code?: unknown })?.code
  return status === 404 || code === 'BlobNotFound' || code === 'ContainerNotFound'
}

const blobText = (op: string, key: string): Effect.Effect<string | null, ReportStoreError> =>
  Effect.gen(function* () {
    const cs = yield* connectionString(op)
    const text = yield* Effect.tryPromise({
      try: async () => {
        const client = BlobServiceClient.fromConnectionString(cs)
          .getContainerClient(REPORTS_CONTAINER)
          .getBlockBlobClient(key)
        const download = await client.download()
        if (download.readableStreamBody === undefined) return null
        const chunks: Array<Buffer> = []
        for await (const chunk of download.readableStreamBody) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk))
        }
        return Buffer.concat(chunks).toString('utf8')
      },
      catch: (cause) => toStoreError(op, cause),
    }).pipe(
      Effect.catchAll((error) =>
        // A slot nobody has written yet is ordinary control flow, not a failure.
        isMissing(error.cause) ? Effect.succeed(null) : Effect.fail(error)
      )
    )
    return text
  })

const putBlobText = (op: string, key: string, text: string): Effect.Effect<void, ReportStoreError> =>
  Effect.gen(function* () {
    const cs = yield* connectionString(op)
    yield* Effect.tryPromise({
      try: () =>
        BlobServiceClient.fromConnectionString(cs)
          .getContainerClient(REPORTS_CONTAINER)
          .getBlockBlobClient(key)
          .uploadData(Buffer.from(text, 'utf8'), {
            blobHTTPHeaders: { blobContentType: 'application/json' },
          }),
      catch: (cause) => toStoreError(op, cause),
    })
  })

const parseJson = (op: string, key: string, text: string): Effect.Effect<unknown, ReportStoreError> =>
  Effect.try({
    try: () => JSON.parse(text) as unknown,
    catch: (cause) => toStoreError(op, `blob ${key} is not JSON: ${String(cause)}`),
  })

const requireLabel = (op: string, label: unknown): Effect.Effect<string, ReportStoreError> =>
  typeof label === 'string' && isDayLabel(label)
    ? Effect.succeed(label)
    : Effect.fail(toStoreError(op, `target day label ${JSON.stringify(label)} is not a resolved YYYY-MM-DD`))

const requireDate = (op: string, value: unknown): Effect.Effect<Date, ReportStoreError> => {
  const date = typeof value === 'string' ? new Date(value) : new Date(NaN)
  return Number.isNaN(date.getTime())
    ? Effect.fail(toStoreError(op, `generatedAt ${JSON.stringify(value)} is not a date`))
    : Effect.succeed(date)
}

interface StoredReportJson {
  html: unknown
  report: unknown
  targetDayLabel: unknown
  generatedAt: unknown
}

const decodeReport = (op: string, key: string, text: string): Effect.Effect<StoredReport, ReportStoreError> =>
  Effect.gen(function* () {
    const json = (yield* parseJson(op, key, text)) as Partial<StoredReportJson>
    if (typeof json.html !== 'string' || typeof json.report !== 'string') {
      return yield* Effect.fail(toStoreError(op, `blob ${key} has no rendered report in it`))
    }
    return {
      html: json.html,
      report: json.report,
      targetDayLabel: yield* requireLabel(op, json.targetDayLabel),
      generatedAt: yield* requireDate(op, json.generatedAt),
    }
  })

interface RunStatusJson {
  generatedAt: unknown
  targetDayLabel: unknown
  success: unknown
  error: unknown
}

const decodeStatus = (op: string, text: string): Effect.Effect<RunStatus, ReportStoreError> =>
  Effect.gen(function* () {
    const json = (yield* parseJson(op, RUN_STATUS_KEY, text)) as Partial<RunStatusJson>
    if (typeof json.success !== 'boolean' || (json.error !== null && typeof json.error !== 'string')) {
      return yield* Effect.fail(toStoreError(RUN_STATUS_KEY, `blob ${RUN_STATUS_KEY} has no run status in it`))
    }
    return {
      generatedAt: yield* requireDate(op, json.generatedAt),
      targetDayLabel: yield* requireLabel(op, json.targetDayLabel),
      success: json.success,
      error: json.error,
    }
  })

/**
 * The blob store: the same `ReportStore` surface, backed by the private
 * container. Keys are the cacheKey constants — the scheduled report is
 * overwritten in place, ad-hoc days sit under their own `day-<label>.json`.
 */
export const makeReportStoreBlob = () => ({
  readScheduled: () =>
    Effect.gen(function* () {
      const text = yield* blobText('store.read-scheduled', SCHEDULED_REPORT_KEY)
      return text === null ? null : yield* decodeReport('store.read-scheduled', SCHEDULED_REPORT_KEY, text)
    }),
  writeScheduled: (report: StoredReport) =>
    Effect.gen(function* () {
      yield* requireLabel('store.write-scheduled', report.targetDayLabel)
      yield* putBlobText(
        'store.write-scheduled',
        SCHEDULED_REPORT_KEY,
        JSON.stringify({ ...report, generatedAt: report.generatedAt.toISOString() })
      )
    }),
  readDay: (day: DayRef) =>
    Effect.gen(function* () {
      yield* requireLabel('store.read-day', day.label)
      const key = dayReportKey(day)
      const text = yield* blobText('store.read-day', key)
      return text === null ? null : yield* decodeReport('store.read-day', key, text)
    }),
  writeDay: (day: DayRef, report: StoredReport) =>
    Effect.gen(function* () {
      yield* requireLabel('store.write-day', day.label)
      yield* requireLabel('store.write-day', report.targetDayLabel)
      yield* putBlobText(
        'store.write-day',
        dayReportKey(day),
        JSON.stringify({ ...report, generatedAt: report.generatedAt.toISOString() })
      )
    }),
  readRunStatus: () =>
    Effect.gen(function* () {
      const text = yield* blobText('store.read-run-status', RUN_STATUS_KEY)
      return text === null ? null : yield* decodeStatus('store.read-run-status', text)
    }),
  writeRunStatus: (status: RunStatus) =>
    Effect.gen(function* () {
      yield* requireLabel('store.write-run-status', status.targetDayLabel)
      yield* putBlobText(
        'store.write-run-status',
        RUN_STATUS_KEY,
        JSON.stringify({ ...status, generatedAt: status.generatedAt.toISOString() })
      )
    }),
})

/** The store the hosted timer and HTTP handler provide. */
export const ReportStoreBlobLive = Layer.succeed(ReportStore, ReportStore.of(makeReportStoreBlob()))
