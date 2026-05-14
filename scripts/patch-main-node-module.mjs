/**
 * O electron-vite insere `import __cjs_mod__ from "node:module"` (esm-shim), mas
 * `node:module` não exporta default em ESM — o processo principal rebenta ao iniciar.
 * Reutilizamos o `import * as nodeModule` que o bundle já contém.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const MAIN_FILE = resolve(process.cwd(), 'out/main/index.js')

export function patchMainBundle() {
  if (!existsSync(MAIN_FILE)) return false
  const code = readFileSync(MAIN_FILE, 'utf8')
  if (!code.includes('import __cjs_mod__ from "node:module"')) return false
  writeFileSync(
    MAIN_FILE,
    code
      .replace(/\r?\nimport __cjs_mod__ from "node:module";/g, '')
      .replace(/__cjs_mod__\.createRequire/g, 'nodeModule.createRequire'),
    'utf8'
  )
  return true
}

const runCli =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (runCli) patchMainBundle()
