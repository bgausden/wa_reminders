import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Effect } from 'effect'
import { generateReportEffect, type ReportTargetDay } from './generate.js'
import { DryRunError } from './mbErrors.js'
import { TEMPLATE_PATH } from './render.js'

// The dry-run is the CLI-shaped edge of report generation: generate the
// report in memory (run + render), then write it out. Generation itself
// lives in ./generate.js and is what the hosted app calls.
//
// Rendering and the domain shapes moved to ./render.js (and ./run.js);
// re-exported here so existing callers keep a single import site.
export {
  buildDryRunHtmlReport,
  buildDryRunReport,
  loadTemplate,
  planTemplateData,
  renderReminder,
  renderReport,
  TEMPLATE_PATH,
  type ReminderTemplateData,
  type RenderedReport,
  type ReportContext,
} from './render.js'
export type { ReminderClient, ReminderRun } from './run.js'

export const DRY_RUN_DIR = 'dry-runs'

const toDryRunError = (op: string, cause: unknown) => new DryRunError({ op, cause })

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

// Full dry-run: generate the report in memory, then write it. Needs
// MbHttp + CurrentUser like the run; provide layers once at the edge
// (src/index.ts). Pass `html: true` (the `--html` flag) to also write
// the HTML report with WhatsApp click-to-chat links. The text report
// never embeds wa.me links.
export const dryRunEffect = (
  templateFile = TEMPLATE_PATH,
  opts?: {
    outDir?: string
    targetDay?: ReportTargetDay
    invokedAt?: Date
    html?: boolean
    now?: Date
  }
) =>
  Effect.gen(function* () {
    const generated = yield* generateReportEffect({
      targetDay: opts?.targetDay,
      invokedAt: opts?.invokedAt,
      templateFile,
    })
    const fileNow = opts?.now ?? new Date()
    const file = yield* writeDryRunReport(generated.report, { outDir: opts?.outDir, now: fileNow })
    let html = ''
    let htmlFile = ''
    if (opts?.html === true) {
      html = generated.html
      htmlFile = yield* writeDryRunHtmlReport(html, { outDir: opts?.outDir, now: fileNow })
    }
    yield* Effect.logInfo('dry-run complete', {
      outputs: generated.outputs.length,
      clients: generated.clients.length,
      file,
      ...(htmlFile.length > 0 ? { htmlFile } : {}),
    })
    return {
      report: generated.report,
      file,
      html,
      htmlFile,
      outputs: generated.outputs,
      clients: generated.clients,
    }
  })
