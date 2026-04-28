// Vendors the top-level shared/ folder into mcp-server/src/shared/ so the
// MCP can be built and published as a standalone npm package without a
// workspace setup. Source of truth lives at /shared/. This script runs
// before tsc in the build chain.
//
// The destination (mcp-server/src/shared/) is gitignored.

import {
  rmSync,
  mkdirSync,
  readdirSync,
  statSync,
  copyFileSync,
  existsSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../../shared')
const dest = resolve(here, '../src/shared')

if (!existsSync(src)) {
  console.error(`sync-shared: source not found at ${src}`)
  process.exit(1)
}

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })

function copyDir(from, to) {
  for (const entry of readdirSync(from)) {
    const fromPath = join(from, entry)
    const toPath = join(to, entry)
    const st = statSync(fromPath)
    if (st.isDirectory()) {
      mkdirSync(toPath, { recursive: true })
      copyDir(fromPath, toPath)
    } else if (entry.endsWith('.ts')) {
      copyFileSync(fromPath, toPath)
    }
  }
}

copyDir(src, dest)
console.log(`sync-shared: copied ${src} -> ${dest}`)
