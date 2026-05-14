#!/usr/bin/env node
/**
 * Arranque estável do servidor MCP para o Cursor: o path do entry é resolvido
 * em relação a este ficheiro, para funcionar mesmo quando o cwd do processo
 * não é a raiz do repo (comportamento observado com args relativos em mcp.json).
 */
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const entry = join(scriptDir, '..', 'mcp-server', 'dist', 'index.js')

await import(pathToFileURL(entry).href)
