// Ship the reminder template with the compiled output.
//
// `tsc` only emits JavaScript, so `src/template.ejs` never reaches `dist`.
// The compiled app resolves the template next to its own module
// (see src/effect/render.ts), so the build has to copy it there:
//
//   "build": "tsc --project tsconfig.json && node scripts/copy-template.mjs"
//
// Usage: node scripts/copy-template.mjs [outDir]   (default: ./dist)
//
// Paths are resolved from this script, not the working directory, so the
// step works from anywhere the build is run from. Fails loudly if the
// source template is missing.
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const source = path.join(repoRoot, 'src', 'template.ejs')
const outDir = path.resolve(repoRoot, process.argv[2] ?? 'dist')
const target = path.join(outDir, 'template.ejs')

await mkdir(outDir, { recursive: true })
await copyFile(source, target)
console.log(
  `template: ${path.relative(repoRoot, source)} -> ${path.relative(repoRoot, target)}`
)
