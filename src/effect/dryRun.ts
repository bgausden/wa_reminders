import ejs from 'ejs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Effect, Schema } from 'effect'
import { DEFAULT_CLIENT_DISPLAY_NAME } from '../constants.js'
import { formatAppointmentParts, formatAppointmentTime } from '../formatAppointmentTime.js'
import { GetClientsResponseSchema } from './MbSchemas.js'
import { DryRunError } from './mbErrors.js'
import { mainEffectLayered, type ReminderOutput } from './pipeline.js'

type DryRunClient = Schema.Schema.Type<typeof GetClientsResponseSchema>['Clients'][number]

export const DRY_RUN_DIR = 'dry-runs'
export const TEMPLATE_PATH = path.resolve('src/template.ejs')

const toDryRunError = (op: string, cause: unknown) => new DryRunError({ op, cause })

// Template source is a file so copy stays in sync with template.ejs.
// Resolved from cwd: run via `npm run dry-run` from the repo root.
export const loadTemplate = (file = TEMPLATE_PATH): Effect.Effect<string, DryRunError> =>
  Effect.tryPromise({
    try: () => readFile(file, 'utf8'),
    catch: (cause) => toDryRunError('dry-run.load-template', cause),
  })

export const renderReminder = (
  template: string,
  data: {
    clientDisplayName: string
    AppointmentTime: string
    AppointmentDay: string
    /** Legacy combined form (`4PM tomorrow (Monday)`); kept for custom templates. */
    StartDateTime: string
  }
): Effect.Effect<string, DryRunError> =>
  Effect.try({
    try: () => ejs.render(template, data),
    catch: (cause) => toDryRunError('dry-run.render', cause),
  })

const clientDisplayName = (
  clients: ReadonlyArray<DryRunClient>,
  clientId: string
): string => {
  const client = clients.find((c) => c.Id === clientId)
  if (!client) return DEFAULT_CLIENT_DISPLAY_NAME
  const name = `${client.FirstName ?? ''} ${client.LastName ?? ''}`.trim()
  return name.length > 0 ? name : DEFAULT_CLIENT_DISPLAY_NAME
}

// Pure assembly wrapped in Effect only because rendering can fail.
// Rendered messages first, suppressed appointments listed after.
export const buildDryRunReport = (
  outputs: ReadonlyArray<ReminderOutput>,
  clients: ReadonlyArray<DryRunClient>,
  template: string
): Effect.Effect<string, DryRunError> =>
  Effect.gen(function* () {
    const lines: Array<string> = []
    const sendable = outputs.filter((o) => o.suppressReason.length === 0)
    const suppressed = outputs.filter((o) => o.suppressReason.length > 0)

    lines.push(`DRY RUN — ${sendable.length} to send, ${suppressed.length} suppressed`, '')
    for (const output of sendable) {
      const { time, day } = formatAppointmentParts(output.StartDateTime)
      const message = yield* renderReminder(template, {
        clientDisplayName: clientDisplayName(clients, output.ClientId),
        AppointmentTime: time,
        AppointmentDay: day,
        StartDateTime: formatAppointmentTime(output.StartDateTime),
      })
      lines.push(`--- to client ${output.ClientId} (staff ${output.StaffId}) ---`, message, '')
    }
    for (const output of suppressed) {
      lines.push(
        `--- suppressed appointment ${output.Id} (client ${output.ClientId}): ${output.suppressReason.join(', ')} ---`
      )
    }
    return lines.join('\n')
  })

const stamp = (now: Date): string => {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
}

export const writeDryRunReport = (
  report: string,
  opts?: { outDir?: string; now?: Date }
): Effect.Effect<string, DryRunError> =>
  Effect.gen(function* () {
    const outDir = opts?.outDir ?? DRY_RUN_DIR
    const file = path.join(outDir, `dry-run-${stamp(opts?.now ?? new Date())}.txt`)
    yield* Effect.tryPromise({
      try: () => mkdir(outDir, { recursive: true }).then(() => writeFile(file, report, 'utf8')),
      catch: (cause) => toDryRunError('dry-run.write', cause),
    })
    return file
  })

// Full dry-run: live pipeline -> render -> file. Needs MbHttp + CurrentUser
// like mainEffectLayered; provide layers once at the edge (src/index.ts).
export const dryRunEffect = (templateFile = TEMPLATE_PATH, opts?: { outDir?: string }) =>
  Effect.gen(function* () {
    const template = yield* loadTemplate(templateFile)
    const { outputs, clients } = yield* mainEffectLayered
    const report = yield* buildDryRunReport(outputs, clients, template)
    const file = yield* writeDryRunReport(report, { outDir: opts?.outDir })
    yield* Effect.logInfo('dry-run complete', {
      outputs: outputs.length,
      clients: clients.length,
      file,
    })
    return { report, file, outputs, clients }
  })
