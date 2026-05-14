#!/usr/bin/env node
/**
 * O bundle `out/main/index.js` fica com `import __cjs_mod__ from "node:module"` (esm-shim
 * do electron-vite), inválido no ESM do Electron. Como o rebuild pode ocorrer imediatamente
 * antes de arrancar o Electron, aplicamos patch em ciclo curto até o watcher assumir.
 */
import { spawn } from 'node:child_process'
import { existsSync, watch } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { patchMainBundle } from './patch-main-node-module.mjs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const evBin = resolve(__dirname, '../node_modules/electron-vite/bin/electron-vite.js')
const mainJs = resolve(process.cwd(), 'out/main/index.js')

const poll = setInterval(() => patchMainBundle(), 20)
setTimeout(() => clearInterval(poll), 20_000)

const child = spawn(process.execPath, [evBin, 'dev'], {
  stdio: 'inherit',
  env: process.env,
  cwd: process.cwd()
})

let debounce
function schedulePatch() {
  clearTimeout(debounce)
  debounce = setTimeout(() => patchMainBundle(), 50)
}

function startWatch() {
  if (!existsSync(mainJs)) {
    setTimeout(startWatch, 200)
    return
  }
  watch(mainJs, () => schedulePatch())
}

startWatch()

child.on('exit', (code, signal) => {
  clearInterval(poll)
  clearTimeout(debounce)
  process.exit(code ?? (signal ? 1 : 0))
})
