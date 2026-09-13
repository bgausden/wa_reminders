import ejs from 'ejs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Effect, Schema } from 'effect'
import { DEFAULT_CLIENT_DISPLAY_NAME } from '../constants.js'
import { formatAppointmentParts, formatAppointmentTime } from '../formatAppointmentTime.js'
import { GetClientsResponseSchema } from './MbSchemas.js'
import { DryRunError } from './mbErrors.js'
import {
  buildWhatsAppLink,
  clientPhoneForWhatsApp,
  escapeHtml,
} from './whatsapp.js'
import {
  buildClientPlans,
  firstName,
  formatServiceList,
  mainEffectLayeredFor,
  type ClientPlan,
  type ReminderOutput,
} from './pipeline.js'
import type { TargetDay } from '../targetDay.js'
import { formatLongDate, formatLongDateTime } from '../targetDay.js'
import { tomorrow } from '../util.js'

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
  /** True when any booking in the plan is in the Services group Laser. Optional for legacy callers; defaults to false. */
  hasLaser?: boolean
  /** True when any booking in the plan is in the Services group Tanning. Optional for legacy callers; defaults to false. */
  hasTanning?: boolean
}

export const renderReminder = (
  template: string,
  data: ReminderTemplateData
): Effect.Effect<string, DryRunError> =>
  Effect.try({
    try: () => {
      const defaults = { firstServices: '', firstStaffName: '', followUps: [], hasLaser: false, hasTanning: false }
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
    hasLaser: (plan as Partial<ClientPlan>).hasLaser === true,
    hasTanning: (plan as Partial<ClientPlan>).hasTanning === true,
  }
}

const clientDisplayName = (
  clients: ReadonlyArray<DryRunClient>,
  clientId: string
): string => {
  const client = clients.find((c) => c.Id === clientId)
  if (!client) return DEFAULT_CLIENT_DISPLAY_NAME
  const first = (client.FirstName ?? '').trim()
  if (first.length > 0) return first
  const last = (client.LastName ?? '').trim()
  return last.length > 0 ? last : DEFAULT_CLIENT_DISPLAY_NAME
}

const findClient = (
  clients: ReadonlyArray<DryRunClient>,
  clientId: string
): DryRunClient | undefined => clients.find((c) => c.Id === clientId)

// Pure assembly wrapped in Effect only because rendering can fail.
// One rendered message per client; suppressed appointments listed after.
// Optional context prepends an invocation/target banner line.
export const buildDryRunReport = (
  outputs: ReadonlyArray<ReminderOutput>,
  clients: ReadonlyArray<DryRunClient>,
  template: string,
  context?: {
    invokedAt?: Date
    targetDay?: Pick<TargetDay, 'midnight' | 'offset'>
  }
): Effect.Effect<string, DryRunError> =>
  Effect.gen(function* () {
    const lines: Array<string> = []
    const plans = buildClientPlans(outputs)
    const suppressed = outputs.filter((o) => o.suppressReason.length > 0)
    const sendableCount = plans.reduce((n, p) => n + p.appointmentIds.length, 0)

    if (context?.targetDay) {
      const invoked = formatLongDateTime(context.invokedAt ?? new Date())
      const target = formatLongDate(context.targetDay.midnight)
      lines.push(
        `Invoked ${invoked} for target day ${target} (offset +${context.targetDay.offset})`,
        ''
      )
    }
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

// HTML dry-run: same messages as the text report, plus one click-to-chat
// link per client. Text report and console output never contain wa.me links.
export const buildDryRunHtmlReport = (
  outputs: ReadonlyArray<ReminderOutput>,
  clients: ReadonlyArray<DryRunClient>,
  template: string,
  context?: {
    invokedAt?: Date
    targetDay?: Pick<TargetDay, 'midnight' | 'offset'>
  }
): Effect.Effect<string, DryRunError> =>
  Effect.gen(function* () {
    const plans = buildClientPlans(outputs)
    const suppressed = outputs.filter((o) => o.suppressReason.length > 0)
    const sendableCount = plans.reduce((n, p) => n + p.appointmentIds.length, 0)

    const banner =
      context?.targetDay !== undefined
        ? `Invoked ${formatLongDateTime(context.invokedAt ?? new Date())} for target day ${formatLongDate(context.targetDay.midnight)} (offset +${context.targetDay.offset})`
        : null
    const summary = `DRY RUN — ${plans.length} to send (${sendableCount} appointments), ${suppressed.length} suppressed`

    const sections: Array<string> = []
    for (const plan of plans) {
      const data = planTemplateData(plan)
      const displayName = clientDisplayName(clients, plan.clientId)
      const message = yield* renderReminder(template, { clientDisplayName: displayName, ...data })
      const firstBlock = plan.blocks[0]
      const phone = clientPhoneForWhatsApp(findClient(clients, plan.clientId))
      const link =
        phone !== null
          ? `<a href="${escapeHtml(buildWhatsAppLink(phone, message))}" target="_blank" rel="noopener noreferrer">Send via WhatsApp to ${escapeHtml(displayName)} (${escapeHtml(phone)})</a>`
          : `<span class="missing">No mobile number — manual lookup needed</span>`
      sections.push(
        `<section class="card">\n<h2>to client ${escapeHtml(plan.clientId)} (staff ${escapeHtml(firstBlock?.staffName ?? '')}, appointments ${escapeHtml(plan.appointmentIds.join(', '))})</h2>\n<p>${link}</p>\n<pre>${escapeHtml(message)}</pre>\n</section>`
      )
    }
    const suppressedBlock =
      suppressed.length > 0
        ? `<h2>Suppressed</h2>\n<ul>\n${suppressed.map((o) => `<li>suppressed appointment ${o.Id} (client ${escapeHtml(o.ClientId)}): ${escapeHtml(o.suppressReason.join(', '))}</li>`).join('\n')}\n</ul>`
        : ''

    return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${escapeHtml(summary)}</title>\n<style>body{font-family:system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem}pre{white-space:pre-wrap;background:#f6f6f6;padding:1rem;border-radius:8px}.card{border:1px solid #ddd;border-radius:8px;padding:1rem;margin:1rem 0}.missing{color:#a00}</style>\n</head>\n<body>\n<h1>${escapeHtml(summary)}</h1>\n${banner !== null ? `<p>${escapeHtml(banner)}</p>\n` : ''}${sections.join('\n')}\n${suppressedBlock}\n</body>\n</html>\n`
  })

export const writeDryRunHtmlReport = (
  html: string,
  opts?: { outDir?: string; now?: Date }
): Effect.Effect<string, DryRunError> =>
  Effect.gen(function* () {
    const outDir = opts?.outDir ?? DRY_RUN_DIR
    const file = path.join(outDir, `dry-run-${stamp(opts?.now ?? new Date())}.html`)
    yield* Effect.tryPromise({
      try: () => mkdir(outDir, { recursive: true }).then(() => writeFile(file, html, 'utf8')),
      catch: (cause) => toDryRunError('dry-run.write-html', cause),
    })
    return file
  })

// Full dry-run: live pipeline -> render -> file. Needs MbHttp + CurrentUser
// like mainEffectLayered; provide layers once at the edge (src/index.ts).
// Pass `html: true` (the `--html` flag) to also build + write the HTML
// report with WhatsApp click-to-chat links. The text report never embeds
// wa.me links.
export const dryRunEffect = (
  templateFile = TEMPLATE_PATH,
  opts?: {
    outDir?: string
    targetDay?: Pick<TargetDay, 'midnight' | 'elevenFiftyNine' | 'offset'>
    invokedAt?: Date
    html?: boolean
    now?: Date
  }
) =>
  Effect.gen(function* () {
    const invokedAt = opts?.invokedAt ?? new Date()
    const targetDay = opts?.targetDay ?? tomorrow
    const template = yield* loadTemplate(templateFile)
    const { outputs, clients } = yield* mainEffectLayeredFor(targetDay)
    const report = yield* buildDryRunReport(outputs, clients, template, { invokedAt, targetDay })
    const fileNow = opts?.now ?? new Date()
    const file = yield* writeDryRunReport(report, { outDir: opts?.outDir, now: fileNow })
    let html = ''
    let htmlFile = ''
    if (opts?.html === true) {
      html = yield* buildDryRunHtmlReport(outputs, clients, template, { invokedAt, targetDay })
      htmlFile = yield* writeDryRunHtmlReport(html, { outDir: opts?.outDir, now: fileNow })
    }
    yield* Effect.logInfo('dry-run complete', {
      outputs: outputs.length,
      clients: clients.length,
      file,
      ...(htmlFile.length > 0 ? { htmlFile } : {}),
    })
    return { report, file, html, htmlFile, outputs, clients }
  })
