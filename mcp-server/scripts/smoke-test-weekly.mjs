#!/usr/bin/env node
/**
 * Smoke test for the weekly-planning MCP tools.
 * Spawns the built server as a child stdio process, drives it with the
 * MCP JSON-RPC protocol, and asserts each new tool responds correctly.
 *
 * Run: node mcp-server/scripts/smoke-test-weekly.mjs
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SERVER_ENTRY = resolve(__dirname, '..', 'dist', 'index.js')
if (!existsSync(SERVER_ENTRY)) {
  console.error('Run `npm run build` first; missing', SERVER_ENTRY)
  process.exit(1)
}

const dataDir = mkdtempSync(join(tmpdir(), 'bloc-smoke-'))
mkdirSync(join(dataDir, '2026'), { recursive: true })

// Origin day: Mon 2026-04-20 (a week before our test week)
writeFileSync(join(dataDir, '2026', '2026-04-20.md'), `---
date: 2026-04-20
pomodoros: 0
updatedAt: 1714000000000
---

## Tarefas

- [ ] Old pending task <!--@id:t-old @created:1713000000000 @est:60-->
- [ ] Younger task <!--@id:t-young @created:1713900000000 @est:30-->
- [x] Already done <!--@id:t-done @created:1713000000000 @completed:1713800000000-->
`)

// Test week: Mon 2026-04-27 .. Sun 2026-05-03 (April 27 is a Monday)
writeFileSync(join(dataDir, '2026', '2026-04-27.md'), `---
date: 2026-04-27
pomodoros: 0
updatedAt: 1714000000000
---

## Tarefas

- [ ] Local Monday task <!--@id:t-mon @created:1714000000000-->
`)

console.log(`Data dir: ${dataDir}`)

const server = spawn('node', [SERVER_ENTRY], {
  env: { ...process.env, BLOC_DATA_DIR: dataDir },
  stdio: ['pipe', 'pipe', 'inherit']
})

let buf = ''
const pending = new Map()
let nextId = 1

server.stdout.on('data', (chunk) => {
  buf += chunk.toString('utf8')
  let idx
  while ((idx = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, idx).trim()
    buf = buf.slice(idx + 1)
    if (!line) continue
    let msg
    try { msg = JSON.parse(line) } catch { continue }
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve: r } = pending.get(msg.id)
      pending.delete(msg.id)
      r(msg)
    }
  }
})

function rpc(method, params) {
  const id = nextId++
  const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    server.stdin.write(payload)
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`Timeout for ${method}`))
      }
    }, 5000)
  })
}

function callTool(name, args) {
  return rpc('tools/call', { name, arguments: args })
}

function fail(label, detail) {
  console.error(`✗ ${label}`)
  if (detail) console.error('  ', detail)
  cleanup()
  process.exit(1)
}

function ok(label) { console.log(`✓ ${label}`) }

function cleanup() {
  try { server.kill() } catch {}
  try { rmSync(dataDir, { recursive: true, force: true }) } catch {}
}

try {
  await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke', version: '0' }
  })
  await rpc('notifications/initialized', {}).catch(() => {}) // server may not respond

  // 1. tools/list contains the 5 new tools
  const toolList = await rpc('tools/list', {})
  const names = toolList.result?.tools?.map((t) => t.name) ?? []
  for (const t of ['read_week', 'list_pending_tasks', 'create_task_ref', 'delete_task_ref', 'distribute_tasks_for_week']) {
    if (!names.includes(t)) fail(`tools/list missing ${t}`, names)
  }
  ok(`tools/list — 5 weekly-planning tools registered`)

  // 2. read_week structured output
  const week = await callTool('read_week', { week_start: '2026-04-27' })
  const weekPayload = JSON.parse(week.result.content[0].text)
  if (weekPayload.weekStart !== '2026-04-27') fail('read_week weekStart', weekPayload)
  if (weekPayload.days.length !== 7) fail('read_week days length', weekPayload)
  if (weekPayload.days[0].data?.tasks[0]?.id !== 't-mon') fail('read_week Mon data', weekPayload.days[0])
  ok('read_week — structured Mon..Sun, includes Mon task')

  // 3. list_pending_tasks finds 2 pending (the completed one is excluded)
  const pending1 = await callTool('list_pending_tasks', {})
  const pendingPayload = JSON.parse(pending1.result.content[0].text)
  if (pendingPayload.total !== 3) fail('list_pending_tasks total (expected 3 pending)', pendingPayload)
  ok(`list_pending_tasks — total=${pendingPayload.total}`)

  // Filter by origin_date
  const pending2 = await callTool('list_pending_tasks', { origin_date: '2026-04-20' })
  const filtered = JSON.parse(pending2.result.content[0].text)
  if (filtered.total !== 2) fail('list_pending_tasks origin filter', filtered)
  ok('list_pending_tasks — origin_date filter')

  // 4. create_task_ref happy path
  const create1 = await callTool('create_task_ref', {
    target_date: '2026-04-28',
    origin_date: '2026-04-20',
    origin_task_id: 't-old'
  })
  const createPayload = JSON.parse(create1.result.content[0].text)
  if (!createPayload.created) fail('create_task_ref created', createPayload)
  ok(`create_task_ref — created refId=${createPayload.ref.id.slice(0, 8)}…`)

  // ref present in MD
  const md = readFileSync(join(dataDir, '2026', '2026-04-28.md'), 'utf-8')
  if (!md.includes('## Referências') || !md.includes('@taskId:t-old')) {
    fail('create_task_ref MD content', md)
  }
  ok('create_task_ref — MD file contains ## Referências')

  // 5. create_task_ref idempotency
  const create2 = await callTool('create_task_ref', {
    target_date: '2026-04-28',
    origin_date: '2026-04-20',
    origin_task_id: 't-old'
  })
  const dup = JSON.parse(create2.result.content[0].text)
  if (dup.created !== false || dup.reason !== 'duplicate') fail('create_task_ref dedup', dup)
  ok('create_task_ref — duplicate skipped')

  // 6. create_task_ref rejects completed origin
  const completedRef = await callTool('create_task_ref', {
    target_date: '2026-04-29',
    origin_date: '2026-04-20',
    origin_task_id: 't-done'
  })
  if (!completedRef.result?.isError) fail('create_task_ref should reject completed', completedRef)
  ok('create_task_ref — rejects completed origin')

  // 7. delete_task_ref idempotent (unknown id returns deleted: false)
  const delMissing = await callTool('delete_task_ref', { target_date: '2026-04-28', ref_id: 'nope' })
  const delMissingPayload = JSON.parse(delMissing.result.content[0].text)
  if (delMissingPayload.deleted !== false) fail('delete_task_ref unknown', delMissingPayload)
  ok('delete_task_ref — unknown id => deleted: false')

  // 8. delete_task_ref happy path
  const del = await callTool('delete_task_ref', { target_date: '2026-04-28', ref_id: createPayload.ref.id })
  if (JSON.parse(del.result.content[0].text).deleted !== true) fail('delete_task_ref real', del)
  const mdAfter = readFileSync(join(dataDir, '2026', '2026-04-28.md'), 'utf-8')
  if (mdAfter.includes('@taskId:t-old')) fail('delete_task_ref MD still has ref', mdAfter)
  ok('delete_task_ref — ref removed from MD')

  // 9. distribute_tasks_for_week dry_run does not write
  const dry = await callTool('distribute_tasks_for_week', { week_start: '2026-04-27', dry_run: true })
  const dryPayload = JSON.parse(dry.result.content[0].text)
  if (!dryPayload.dryRun) fail('distribute dry_run flag', dryPayload)
  if (dryPayload.assignments.length !== 2) fail('distribute dry_run assignments (expected 2 from origin 2026-04-20)', dryPayload)
  // No MD writes for dry_run
  if (existsSync(join(dataDir, '2026', '2026-04-29.md'))) fail('dry_run wrote a new file', '2026-04-29.md exists')
  ok(`distribute (dry_run) — ${dryPayload.assignments.length} planned, no writes`)

  // 10. distribute non-dry-run writes refs
  const apply = await callTool('distribute_tasks_for_week', { week_start: '2026-04-27' })
  const applyPayload = JSON.parse(apply.result.content[0].text)
  if (applyPayload.appliedCount !== 2) fail('distribute applied count', applyPayload)
  ok(`distribute (apply) — appliedCount=${applyPayload.appliedCount}`)

  cleanup()
  console.log('\nAll smoke tests passed.')
} catch (e) {
  fail('exception', e?.stack ?? e)
}
