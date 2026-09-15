import ejs from 'ejs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Effect, Schema } from 'effect'
import { DEFAULT_CLIENT_DISPLAY_NAME } from '../constants.js'
import { formatAppointmentParts, formatAppointmentTime } from '../formatAppointmentTime.js'
import { GetClientsResponseSchema } from './MbSchemas.js'
import { DryRunError } from './mbErrors.js'
import {
  buildWhatsAppLink,
  clientPhoneForWhatsApp,
  escapeHtml,
  formatPhoneForDisplay,
} from './whatsapp.js'
import {
  buildClientPlans,
  firstName,
  formatServiceList,
  type ClientPlan,
  type ReminderOutput,
} from './pipeline.js'
import type { ReminderClient, ReminderRun } from './run.js'
import type { TargetDay } from '../targetDay.js'
import { formatLongDate, formatLongDateTime } from '../targetDay.js'

type RenderClient = ReminderClient

// The template ships with the build: `scripts/copy-template.mjs` (part of
// `npm run build`) puts it beside the emitted output, so the shipped copy
// is `dist/template.ejs` next to `dist/effect/render.js`. Resolved from
// this module rather than the working directory, because the hosted app
// runs with no `src/` folder and with a cwd that is not the repo. From
// source (`tsx src/index.ts`) the same path is `src/template.ejs`, so the
// CLI is unchanged.
export const TEMPLATE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'template.ejs'
)

const toRenderError = (op: string, cause: unknown) => new DryRunError({ op, cause })

// Template source is a file so copy stays in sync with template.ejs.
// The only impure part of this module — it just hands the template
// source to the pure renderers below, which never touch the disk.
export const loadTemplate = (file = TEMPLATE_PATH): Effect.Effect<string, DryRunError> =>
  Effect.tryPromise({
    try: () => readFile(file, 'utf8'),
    catch: (cause) => toRenderError('dry-run.load-template', cause),
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
    catch: (cause) => toRenderError('dry-run.render', cause),
  })

export const planTemplateData = (
  plan: ClientPlan,
  now: Date = new Date()
): Omit<ReminderTemplateData, 'clientDisplayName'> => {
  const { time, day } = formatAppointmentParts(plan.firstStartDateTime, now)
  const first = plan.blocks[0]
  const followUps = plan.blocks.slice(1).map((block, i) => ({
    staffName: firstName(block.staffName),
    services: formatServiceList(block.services),
    prevStaffName: firstName(plan.blocks[i]?.staffName ?? first?.staffName ?? ''),
  }))
  return {
    AppointmentTime: time,
    AppointmentDay: day,
    StartDateTime: formatAppointmentTime(plan.firstStartDateTime, now),
    firstServices: formatServiceList(first?.services ?? []),
    firstStaffName: firstName(first?.staffName ?? ''),
    followUps,
    hasLaser: (plan as Partial<ClientPlan>).hasLaser === true,
    hasTanning: (plan as Partial<ClientPlan>).hasTanning === true,
  }
}

const clientDisplayName = (
  clients: ReadonlyArray<RenderClient>,
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
  clients: ReadonlyArray<RenderClient>,
  clientId: string
): RenderClient | undefined => clients.find((c) => c.Id === clientId)

// Header phones: `mobile +<digits>, home +<digits>` with a space before
// each number and contiguous `+digits` (no internal spaces) so a
// double-click selects the whole number for cut-paste. Missing numbers
// render as `-`.
const clientPhonesHeader = (client: RenderClient | undefined): string => {
  const mobile = formatPhoneForDisplay(client?.MobilePhone) ?? '-'
  const home = formatPhoneForDisplay(client?.HomePhone) ?? '-'
  return `mobile ${mobile}, home ${home}`
}

/** When the report was produced and which day it covers. */
export interface ReportContext {
  invokedAt?: Date
  targetDay?: Pick<TargetDay, 'midnight' | 'offset'>
}

// Pure assembly wrapped in Effect only because rendering can fail.
// One rendered message per client; suppressed appointments listed after.
// Optional context prepends an invocation/target banner line.
export const buildDryRunReport = (
  outputs: ReadonlyArray<ReminderOutput>,
  clients: ReadonlyArray<ReminderClient>,
  template: string,
  context?: ReportContext
): Effect.Effect<string, DryRunError> =>
  Effect.gen(function* () {
    const lines: Array<string> = []
    const plans = buildClientPlans(outputs)
    const suppressed = outputs.filter((o) => o.suppressReason.length > 0)
    const sendableCount = plans.reduce((n, p) => n + p.appointmentIds.length, 0)
    // Relative day labels ("tomorrow (Monday)") are computed against the
    // invocation time, not the wall clock, so a report rendered later (or
    // in a test with a fixed invokedAt) labels days consistently.
    const now = context?.invokedAt ?? new Date()

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
      const data = planTemplateData(plan, now)
      const message = yield* renderReminder(template, {
        clientDisplayName: clientDisplayName(clients, plan.clientId),
        ...data,
      })
      const firstBlock = plan.blocks[0]
      lines.push(
        `--- to client ${plan.clientId} (staff ${firstBlock?.staffName ?? ''}, appointments ${plan.appointmentIds.join(', ')}, ${clientPhonesHeader(findClient(clients, plan.clientId))}) ---`,
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

// HTML dry-run: same messages as the text report, plus one click-to-chat
// link per client. Text report and console output never contain wa.me links.
export const buildDryRunHtmlReport = (
  outputs: ReadonlyArray<ReminderOutput>,
  clients: ReadonlyArray<ReminderClient>,
  template: string,
  context?: ReportContext
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
    const now = context?.invokedAt ?? new Date()
    for (const plan of plans) {
      const data = planTemplateData(plan, now)
      const displayName = clientDisplayName(clients, plan.clientId)
      const message = yield* renderReminder(template, { clientDisplayName: displayName, ...data })
      const firstBlock = plan.blocks[0]
      const phone = clientPhoneForWhatsApp(findClient(clients, plan.clientId))
      const link =
        phone !== null
          ? `<a href="${escapeHtml(buildWhatsAppLink(phone, message))}" target="_blank" rel="noopener noreferrer">Send via WhatsApp to ${escapeHtml(displayName)} (${escapeHtml(phone)})</a>`
          : `<span class="missing">No mobile number — manual lookup needed</span>`
      sections.push(
        `<section class="card">\n<h2>to client ${escapeHtml(plan.clientId)} (staff ${escapeHtml(firstBlock?.staffName ?? '')}, appointments ${escapeHtml(plan.appointmentIds.join(', '))}, ${escapeHtml(clientPhonesHeader(findClient(clients, plan.clientId)))})</h2>\n<p>${link}</p>\n<pre>${escapeHtml(message)}</pre>\n</section>`
      )
    }
    const suppressedBlock =
      suppressed.length > 0
        ? `<h2>Suppressed</h2>\n<ul>\n${suppressed.map((o) => `<li>suppressed appointment ${o.Id} (client ${escapeHtml(o.ClientId)}): ${escapeHtml(o.suppressReason.join(', '))}</li>`).join('\n')}\n</ul>`
        : ''

    return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${escapeHtml(summary)}</title>\n<style>body{font-family:system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem}pre{white-space:pre-wrap;background:#f6f6f6;padding:1rem;border-radius:8px}.card{border:1px solid #ddd;border-radius:8px;padding:1rem;margin:1rem 0}.missing{color:#a00}</style>\n</head>\n<body>\n<h1>${escapeHtml(summary)}</h1>\n${banner !== null ? `<p>${escapeHtml(banner)}</p>\n` : ''}${sections.join('\n')}\n${suppressedBlock}\n</body>\n</html>\n`
  })

/** Both forms of the report: plain text for console/file, HTML for the browser. */
export interface RenderedReport {
  /** Plain-text report. Never contains wa.me links. */
  report: string
  /** HTML report with one click-to-chat link per client. */
  html: string
}

/**
 * Render a run: domain data plus the template and the report context in,
 * the text report and the HTML report out. Pure — no disk, no network.
 */
export const renderReport = (
  run: ReminderRun,
  template: string,
  context?: ReportContext
): Effect.Effect<RenderedReport, DryRunError> =>
  Effect.gen(function* () {
    const report = yield* buildDryRunReport(run.outputs, run.clients, template, context)
    const html = yield* buildDryRunHtmlReport(run.outputs, run.clients, template, context)
    return { report, html }
  })
