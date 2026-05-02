import { useTaskStore, type Task } from '../stores/taskStore'
import { useTimeBlockStore, type TimeBlock } from '../stores/timeBlockStore'
import { usePomodoroStore } from '../stores/pomodoroStore'
import { callOpenAI, callAnthropic, callGemini } from './aiService'
import type { AIProvider } from '../stores/settingsStore'

// ── Types ──────────────────────────────────────────────────────────

export interface TaskSummary {
  text: string
  completed: boolean
  subtasksDone: number
  subtasksTotal: number
}

export interface BlockSummary {
  title: string
  startTime: number
  endTime: number
  durationMinutes: number
}

export interface BlockWithTasks {
  blockId: string
  title: string
  startTime: number
  endTime: number
  durationMinutes: number
  tasks: TaskSummary[]
}

export interface DaySnapshot {
  date: string
  tasks: { total: number; completed: number; items: TaskSummary[] }
  timeBlocks: { count: number; totalMinutes: number; items: BlockSummary[] }
  blocks: BlockWithTasks[]
  pomodoros: number
}

export interface StandupResult {
  yesterday: string
  today: string
  blockers: string
  generatedAt: number
  source: 'template' | 'ai'
}

// ── Helpers ────────────────────────────────────────────────────────

export function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function formatTime(minutesFromMidnight: number): string {
  const h = Math.floor(minutesFromMidnight / 60)
  const m = minutesFromMidnight % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function countSubtasks(subtasks: Task[]): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const st of subtasks) {
    total++
    if (st.completed) done++
    if (st.subtasks.length > 0) {
      const nested = countSubtasks(st.subtasks)
      done += nested.done
      total += nested.total
    }
  }
  return { done, total }
}

// ── Data Gathering ─────────────────────────────────────────────────

export function gatherDayData(date: string): DaySnapshot {
  const tasks = useTaskStore.getState().getTasksForDate(date)
  const blocks = useTimeBlockStore.getState().getBlocksForDate(date).filter((b) => !b.private)
  const pomodoros = usePomodoroStore.getState().getCompletedForDate(date)

  const taskItems: TaskSummary[] = tasks.map((t) => {
    const sub = countSubtasks(t.subtasks)
    return {
      text: t.text,
      completed: t.completed,
      subtasksDone: sub.done,
      subtasksTotal: sub.total
    }
  })

  const blockItems: BlockSummary[] = blocks.map((b) => ({
    title: b.title || 'Sem título',
    startTime: b.startTime,
    endTime: b.endTime,
    durationMinutes: b.endTime - b.startTime
  }))

  const totalMinutes = blockItems.reduce((acc, b) => acc + b.durationMinutes, 0)

  // Gather tasks inside each block via composite key "date__block__blockId"
  const taskStore = useTaskStore.getState()
  const blocksWithTasks: BlockWithTasks[] = blocks.map((b) => {
    const blockTasks = taskStore.getTasksForDate(`${date}__block__${b.id}`)
    return {
      blockId: b.id,
      title: b.title || 'Sem título',
      startTime: b.startTime,
      endTime: b.endTime,
      durationMinutes: b.endTime - b.startTime,
      tasks: blockTasks.map((t) => {
        const sub = countSubtasks(t.subtasks)
        return { text: t.text, completed: t.completed, subtasksDone: sub.done, subtasksTotal: sub.total }
      })
    }
  })

  return {
    date,
    tasks: { total: taskItems.length, completed: taskItems.filter((t) => t.completed).length, items: taskItems },
    timeBlocks: { count: blockItems.length, totalMinutes, items: blockItems },
    blocks: blocksWithTasks,
    pomodoros
  }
}

// ── Template Formatting ────────────────────────────────────────────

function formatTaskBullets(items: TaskSummary[], onlyCompleted: boolean): string {
  const filtered = onlyCompleted ? items.filter((t) => t.completed) : items
  if (filtered.length === 0) return ''
  return filtered
    .map((t) => {
      const check = t.completed ? '[x]' : '[ ]'
      const sub = t.subtasksTotal > 0 ? ` (${t.subtasksDone}/${t.subtasksTotal} subtarefas)` : ''
      return `  ${check} ${t.text}${sub}`
    })
    .join('\n')
}

function formatBlockWithTasksBullets(
  blocks: BlockWithTasks[],
  filterCompleted: boolean
): string {
  const lines: string[] = []

  for (const block of blocks) {
    const timeRange = `${formatTime(block.startTime)}–${formatTime(block.endTime)}`

    if (block.tasks.length === 0) {
      // Block without tasks — show as a simple bullet
      lines.push(`  • ${timeRange} ${block.title}`)
      continue
    }

    const filtered = block.tasks.filter((t) => (filterCompleted ? t.completed : !t.completed))
    if (filtered.length === 0) continue

    // Block header with tasks indented below
    lines.push(`  ${block.title} (${timeRange}):`)
    for (const t of filtered) {
      const check = t.completed ? '[x]' : '[ ]'
      const sub = t.subtasksTotal > 0 ? ` (${t.subtasksDone}/${t.subtasksTotal} subtarefas)` : ''
      lines.push(`    ${check} ${t.text}${sub}`)
    }
  }

  return lines.join('\n')
}

export function formatTemplateStandup(yesterday: DaySnapshot, today: DaySnapshot): StandupResult {
  // ── Yesterday ──
  let yesterdayText: string
  const yHasData =
    yesterday.tasks.total > 0 ||
    yesterday.blocks.length > 0 ||
    yesterday.pomodoros > 0

  if (!yHasData) {
    yesterdayText = 'Dia limpo — sem tarefas registadas.'
  } else {
    const parts: string[] = []

    // Completed section: day-level completed tasks + block completed tasks
    const dayCompletedBullets = formatTaskBullets(yesterday.tasks.items, true)
    const blockCompletedBullets = formatBlockWithTasksBullets(yesterday.blocks, true)

    if (dayCompletedBullets || blockCompletedBullets) {
      parts.push('Feitos:')
      if (dayCompletedBullets) parts.push(dayCompletedBullets)
      if (blockCompletedBullets) parts.push(blockCompletedBullets)
    }

    if (yesterday.pomodoros > 0) {
      parts.push(`${yesterday.pomodoros} pomodoro${yesterday.pomodoros > 1 ? 's' : ''} concluído${yesterday.pomodoros > 1 ? 's' : ''}`)
    }

    // Incomplete section: day-level incomplete tasks + block incomplete tasks
    const dayIncompleteBullets = formatTaskBullets(
      yesterday.tasks.items.filter((t) => !t.completed),
      false
    )
    const blockIncompleteBullets = formatBlockWithTasksBullets(yesterday.blocks, false)

    if (dayIncompleteBullets || blockIncompleteBullets) {
      parts.push('Por concluir:')
      if (dayIncompleteBullets) parts.push(dayIncompleteBullets)
      if (blockIncompleteBullets) parts.push(blockIncompleteBullets)
    }

    yesterdayText = parts.join('\n')
  }

  // ── Today ──
  let todayText: string
  const tHasData = today.tasks.total > 0 || today.blocks.length > 0

  if (!tHasData) {
    todayText = 'Sem tarefas planeadas — dia livre para planear.'
  } else {
    const parts: string[] = []

    // Day-level tasks
    const dayTaskBullets = formatTaskBullets(today.tasks.items, false)

    // Blocks: show all tasks (incomplete) + blocks without tasks as bullets
    const blockBullets = formatBlockWithTasksBullets(today.blocks, false)

    if (dayTaskBullets || blockBullets) {
      parts.push('Para Fazer:')
      if (dayTaskBullets) parts.push(dayTaskBullets)
      if (blockBullets) parts.push(blockBullets)
    }

    todayText = parts.join('\n')
  }

  // ── Blockers ──
  const blockersText = 'Sem bloqueios identificados.'

  return {
    yesterday: yesterdayText,
    today: todayText,
    blockers: blockersText,
    generatedAt: Date.now(),
    source: 'template'
  }
}

// ── AI Generation ──────────────────────────────────────────────────

const AI_SYSTEM_PROMPT = `És um assistente de produtividade. Gera um resumo de daily standup com base nos dados fornecidos.

Regras:
- Responde SEMPRE em Português (PT)
- Usa bullet points simples, sem emojis
- Sê factual e conciso — não inventes dados
- O resumo deve ser profissional mas amigável
- TEMPO VERBAL É CRUCIAL:
  - Secção "yesterday" (ontem): usa SEMPRE o pretérito perfeito (passado). Exemplos: "Implementei a funcionalidade X", "Corrigi o bug no formulário", "Desenhei os wireframes", "Revi os pull requests", "Participei na reunião de alinhamento"
  - Secção "today" (hoje): usa SEMPRE o futuro do indicativo. Exemplos: "Implementarei a funcionalidade Y", "Corrigirei o bug Z", "Farei deploy para staging", "Participarei na reunião", "Escreverei testes unitários"
  - NUNCA uses infinitivo ("Implementar", "Corrigir") nem presente ("Implemento", "Corrijo")
- Cada task dentro de um bloco está relacionada com o título do bloco. Funde o contexto do bloco com a task numa frase natural. Exemplo: bloco "Teste de sync" com task "Preencher formulário" → "Preenchi o formulário do teste de sync" (ontem) ou "Preencherei o formulário do teste de sync" (hoje)
- Blocos sem tarefas aparecem como actividade simples (ex: "Sessão de foco profundo (14:00–16:00)")
- Tarefas do dia (sem bloco) aparecem normalmente
- Retorna APENAS um JSON com as keys: "yesterday", "today", "blockers"
- Cada valor é uma string com bullets formatados (um bullet por linha, prefixado com "• ")
- Max 1024 tokens`

function formatBlocksForPrompt(blocks: BlockWithTasks[]): string {
  return blocks
    .map((b) => {
      const header = `  - ${formatTime(b.startTime)}-${formatTime(b.endTime)} ${b.title}`
      if (b.tasks.length === 0) return header
      const taskLines = b.tasks
        .map((t) => `      ${t.completed ? '[x]' : '[ ]'} ${t.text}${t.subtasksTotal > 0 ? ` (${t.subtasksDone}/${t.subtasksTotal} sub)` : ''}`)
        .join('\n')
      return `${header}\n${taskLines}`
    })
    .join('\n')
}

function buildUserPrompt(yesterday: DaySnapshot, today: DaySnapshot): string {
  return `Dados de ontem (${yesterday.date}):
- Tarefas do dia: ${yesterday.tasks.completed}/${yesterday.tasks.total} concluídas
${yesterday.tasks.items.map((t) => `  - ${t.completed ? '[x]' : '[ ]'} ${t.text}${t.subtasksTotal > 0 ? ` (${t.subtasksDone}/${t.subtasksTotal} sub)` : ''}`).join('\n')}
- Blocos de tempo: ${yesterday.timeBlocks.count} (${formatMinutes(yesterday.timeBlocks.totalMinutes)})
${formatBlocksForPrompt(yesterday.blocks)}
- Pomodoros: ${yesterday.pomodoros}

Dados de hoje (${today.date}):
- Tarefas do dia: ${today.tasks.total}
${today.tasks.items.map((t) => `  - ${t.completed ? '[x]' : '[ ]'} ${t.text}`).join('\n')}
- Blocos agendados: ${today.timeBlocks.count} (${formatMinutes(today.timeBlocks.totalMinutes)})
${formatBlocksForPrompt(today.blocks)}

Gera o daily standup em JSON.`
}

function parseAIResponse(raw: string): { yesterday: string; today: string; blockers: string } {
  let cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (jsonMatch) cleaned = jsonMatch[0]

  const parsed = JSON.parse(cleaned)
  if (typeof parsed.yesterday !== 'string' || typeof parsed.today !== 'string' || typeof parsed.blockers !== 'string') {
    throw new Error('Formato de resposta IA inválido')
  }
  return parsed
}

export async function generateAIStandup(
  yesterday: DaySnapshot,
  today: DaySnapshot,
  provider: AIProvider,
  apiKey: string,
  model: string
): Promise<StandupResult> {
  const userMsg = buildUserPrompt(yesterday, today)

  let raw: string
  switch (provider) {
    case 'openai':
      raw = await callOpenAI(AI_SYSTEM_PROMPT, userMsg, apiKey, model)
      break
    case 'anthropic':
      raw = await callAnthropic(AI_SYSTEM_PROMPT, userMsg, apiKey, model)
      break
    case 'gemini':
      raw = await callGemini(AI_SYSTEM_PROMPT, userMsg, apiKey, model)
      break
  }

  const parsed = parseAIResponse(raw)

  return {
    yesterday: parsed.yesterday,
    today: parsed.today,
    blockers: parsed.blockers,
    generatedAt: Date.now(),
    source: 'ai'
  }
}

// ── Clipboard Formatting ───────────────────────────────────────────

export function formatForClipboard(result: StandupResult): string {
  return `*Daily Standup*

*Ontem:*
${result.yesterday}

*Hoje:*
${result.today}

*Bloqueios:*
${result.blockers}`
}
