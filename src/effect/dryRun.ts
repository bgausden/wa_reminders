import ejs from 'ejs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Effect, Schema } from 'effect'
import { DEFAULT_CLIENT_DISPLAY_NAME } from '../constants.js'
import { formatAppointmentParts, formatAppointmentTime } from '../formatAppointmentTime.js'
import { GetClientsResponseSchema } from './MbSchemas.js'
import { DryRunError } from './mbErrors.js'
import {
  buildClientPlans,
  firstName,
  formatServiceList,
  mainEffectLayered,
  type ClientPlan,
  type ReminderOutput,
} from './pipeline.js'

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

export interface ReminderTemplateData {
  clientDisplayName: string
  AppointmentTime: string
  AppointmentDay: string
  /** Legacy combined form (`4PM tomorrow (Monday)`); kept for custom templates. */
  StartDateTime: string
  /** `Laser A and Facial` for the first staff block. */
  firstServices: string
  /** First name of the first staff block, e.g. `Tamara`. */
  firstStaffName: string
  /** One entry per later staff block, in chronological order. */
  followUps: Array<{ staffName: string; services: string; prevStaffName: string }>
}

export const renderReminder = (
  template: string,
  data: ReminderTemplateData
): Effect.Effect<string, DryRunError> =>
  Effect.try({
    try: () => {
      const defaults = { firstServices: '', firstStaffName: '', followUps: [] }
      return ejs.render(template, Object.assign({}, defaults, data))
    },
    catch: (cause) => toDryRunError('dry-run.render', cause),
  })

export const planTemplateData = (
  plan: ClientPlan
): Omit<ReminderTemplateData, 'clientDisplayName'> => {
  const { time, day } = formatAppointmentParts(plan.firstStartDateTime)
  const first = plan.blocks[0]
  const followUps = plan.blocks.slice(1).map((block, i) => ({
    staffName: firstName(block.staffName),
    services: formatServiceList(block.services),
    prevStaffName: firstName(plan.blocks[i]?.staffName ?? first?.staffName ?? ''),
  }))
  return {
    AppointmentTime: time,
    AppointmentDay: day,
    StartDateTime: formatAppointmentTime(plan.firstStartDateTime),
    firstServices: formatServiceList(first?.services ?? []),
    firstStaffName: firstName(first?.staffName ?? ''),
    followUps,
  }
}

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
// One rendered message per client; suppressed appointments listed after.
export const buildDryRunReport = (
  outputs: ReadonlyArray<ReminderOutput>,
  clients: ReadonlyArray<DryRunClient>,
  template: string
): Effect.Effect<string, DryRunError> =>
  Effect.gen(function* () {
    const lines: Array<string> = []
    const plans = buildClientPlans(outputs)
    const suppressed = outputs.filter((o) => o.suppressReason.length > 0)
    const sendableCount = plans.reduce((n, p) => n + p.appointmentIds.length, 0)

    lines.push(`DRY RUN — ${plans.length} to send (${sendableCount} appointments), ${suppressed.length} suppressed`, '')
    for (const plan of plans) {
      const data = planTemplateData(plan)
      const message = yield* renderReminder(template, {
        clientDisplayName: clientDisplayName(clients, plan.clientId),
        ...data,
      })
      const firstBlock = plan.blocks[0]
      lines.push(
        `--- to client ${plan.clientId} (staff ${firstBlock?.staffName ?? ''}, appointments ${plan.appointmentIds.join(', ')}) ---`,
        message,
        ''
      )
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
