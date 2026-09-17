// Ship the reminder template and the Glow brand asset with the compiled output.
//
// `tsc` only emits JavaScript, so `src/template.ejs` never reaches `dist`.
// The compiled app resolves the template next to its own module
// (see src/effect/render.ts), so the build has to copy it there. The brand
// SVG is inlined into the HTML at render time (see src/report/glowBrand.ts),
// but the raw asset ships too so the file in `dist` stays reviewable:
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

// Raw brand asset for reviewability; the HTML inlines src/report/glowBrand.ts.
const brandSource = path.join(repoRoot, 'src', 'assets', 'glow-horizontal.svg')
const brandDir = path.join(outDir, 'assets')
await mkdir(brandDir, { recursive: true })
await copyFile(brandSource, path.join(brandDir, 'glow-horizontal.svg'))
console.log(
  `brand: ${path.relative(repoRoot, brandSource)} -> ${path.relative(repoRoot, brandDir)}`
)
