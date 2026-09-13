import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { loadTemplate, TEMPLATE_PATH } from '../src/effect/render.js'

// The compiled app has no `src/` folder and its working directory is not
// the repo, so the template has to be found from the module itself and
// shipped by the build.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceTemplate = path.join(repoRoot, 'src', 'template.ejs')
const source = readFileSync(sourceTemplate, 'utf8')
const copyTemplate = path.join(repoRoot, 'scripts', 'copy-template.mjs')

describe('the shipped reminder template', () => {
  it('is found beside the module, whatever the working directory is', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'template-'))
    const cwd = process.cwd()
    process.chdir(dir)
    try {
      expect(TEMPLATE_PATH).toBe(sourceTemplate)
      expect(await Effect.runPromise(loadTemplate())).toBe(source)
    } finally {
      process.chdir(cwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('is copied next to the compiled output by the build step', () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'build-'))
    try {
      execFileSync(process.execPath, [copyTemplate, outDir], { stdio: 'pipe' })
      expect(readFileSync(path.join(outDir, 'template.ejs'), 'utf8')).toBe(source)
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})
