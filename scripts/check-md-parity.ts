/**
 * Markdown serializer parity check.
 *
 * Both the renderer (Electron main) and the mcp-server have their own copy
 * of the day-file serializer. Drift between them silently corrupts data
 * round-tripped through MCP. This script feeds a handful of fixtures
 * through both and asserts byte-equal output.
 *
 * Run: node --experimental-strip-types scripts/check-md-parity.ts
 */
import {
  serialize as serializeMain,
  deserialize as deserializeMain,
  type DayFileData as DayFileMain
} from '../src/main/services/markdownSerializer.ts'
import {
  serialize as serializeMcp,
  deserialize as deserializeMcp,
  type DayFileData as DayFileMcp
} from '../mcp-server/src/markdown.ts'

interface Fixture {
  name: string
  md: string
}

const FIXTURES: Fixture[] = [
  {
    name: 'minimal — only tasks',
    md: `---
date: 2026-04-28
pomodoros: 0
updatedAt: 1714305600000
---

## Tarefas

- [ ] Task A <!--@id:t-a @created:1714000000000-->
- [x] Task B <!--@id:t-b @created:1714000000000 @completed:1714200000000 @est:30-->
`
  },
  {
    name: 'with refs section',
    md: `---
date: 2026-04-28
pomodoros: 2
updatedAt: 1714305600000
---

## Tarefas

- [ ] Local task <!--@id:t-1 @created:1714000000000-->

## Referências

- "Other day's task" <!--@refId:r-1 @origin:2026-04-25 @taskId:t-99 @added:1714305600000-->
- "Quoted \\"snapshot\\"" <!--@refId:r-2 @origin:2026-04-26 @taskId:t-100 @added:1714305700000-->

## Distrações

- [pending] Twitter <!--@id:d-1 @created:1714305800000-->
`
  },
  {
    name: 'blocks + block-tasks + unknown section passthrough',
    md: `---
date: 2026-04-28
pomodoros: 4
updatedAt: 1714305600000
---

## Tarefas

- [ ] Outside task <!--@id:t-out @created:1714000000000-->

## Blocos de Tempo

- Deep work <!--@id:b-1 @start:1714305600000 @end:1714312800000 @color:indigo @created:1714000000000 @updated:1714000000000-->

### Bloco: Deep work <!--@blockId:b-1-->

- [ ] Bloc-task <!--@id:t-bt @created:1714000000000-->

## Foo

- arbitrary line preserved
- another line
`
  }
]

function assertEqual(a: string, b: string, label: string): void {
  if (a === b) return
  // Find first difference for a useful diagnostic
  let i = 0
  while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++
  const ctxStart = Math.max(0, i - 30)
  const ctxEnd = Math.min(Math.max(a.length, b.length), i + 30)
  console.error(`\n✗ ${label}`)
  console.error(`  diff at index ${i}`)
  console.error(`  main: …${JSON.stringify(a.slice(ctxStart, ctxEnd))}…`)
  console.error(`  mcp:  …${JSON.stringify(b.slice(ctxStart, ctxEnd))}…`)
  process.exitCode = 1
}

function assertDeepDayFile(a: DayFileMain, b: DayFileMcp, label: string): void {
  // Both shapes are structurally identical — JSON round-trip compares cleanly.
  const sa = JSON.stringify(a)
  const sb = JSON.stringify(b)
  if (sa !== sb) {
    console.error(`\n✗ ${label} — parsed objects differ`)
    console.error(`  main: ${sa}`)
    console.error(`  mcp:  ${sb}`)
    process.exitCode = 1
  }
}

let passed = 0
for (const fx of FIXTURES) {
  const parsedMain = deserializeMain(fx.md)
  const parsedMcp = deserializeMcp(fx.md)
  assertDeepDayFile(parsedMain, parsedMcp, `[${fx.name}] deserialize parity`)

  const rtMain = serializeMain(parsedMain)
  const rtMcp = serializeMcp(parsedMcp as DayFileMain)
  assertEqual(rtMain, rtMcp, `[${fx.name}] serialize parity`)

  // Round-trip stability: serialize→deserialize→serialize must converge.
  const rt2Main = serializeMain(deserializeMain(rtMain))
  assertEqual(rtMain, rt2Main, `[${fx.name}] main round-trip stability`)
  const rt2Mcp = serializeMcp(deserializeMcp(rtMcp))
  assertEqual(rtMcp, rt2Mcp, `[${fx.name}] mcp round-trip stability`)

  if (process.exitCode !== 1) {
    console.log(`✓ ${fx.name}`)
    passed++
  }
}

if (process.exitCode === 1) {
  console.error(`\n${passed}/${FIXTURES.length} fixtures passed.`)
  process.exit(1)
}
console.log(`\n${passed}/${FIXTURES.length} fixtures passed.`)
