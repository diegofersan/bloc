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

export interface DaySnapshot {
  date: string
  tasks: { total: number; completed: number; items: TaskSummary[] }
  timeBlocks: { count: number; totalMinutes: number; items: BlockSummary[] }
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
  const blocks = useTimeBlockStore.getState().getBlocksForDate(date)
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

  return {
    date,
    tasks: { total: taskItems.length, completed: taskItems.filter((t) => t.completed).length, items: taskItems },
    timeBlocks: { count: blockItems.length, totalMinutes, items: blockItems },
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

function formatBlockBullets(items: BlockSummary[]): string {
  if (items.length === 0) return ''
  return items
    .map((b) => `  • ${formatTime(b.startTime)}–${formatTime(b.endTime)} ${b.title} (${formatMinutes(b.durationMinutes)})`)
    .join('\n')
}

export function formatTemplateStandup(yesterday: DaySnapshot, today: DaySnapshot): StandupResult {
  // ── Yesterday ──
  let yesterdayText: string
  const yHasData = yesterday.tasks.total > 0 || yesterday.timeBlocks.count > 0 || yesterday.pomodoros > 0

  if (!yHasData) {
    yesterdayText = 'Dia limpo — sem tarefas registadas.'
  } else {
    const parts: string[] = []

    if (yesterday.tasks.completed > 0) {
      parts.push(`Tarefas concluídas (${yesterday.tasks.completed}/${yesterday.tasks.total}):`)
      parts.push(formatTaskBullets(yesterday.tasks.items, true))
    }

    if (yesterday.timeBlocks.count > 0) {
      parts.push(`Blocos de tempo (${formatMinutes(yesterday.timeBlocks.totalMinutes)} total):`)
      parts.push(formatBlockBullets(yesterday.timeBlocks.items))
    }

    if (yesterday.pomodoros > 0) {
      parts.push(`${yesterday.pomodoros} pomodoro${yesterday.pomodoros > 1 ? 's' : ''} concluído${yesterday.pomodoros > 1 ? 's' : ''}`)
    }

    if (yesterday.tasks.total > yesterday.tasks.completed) {
      const incomplete = yesterday.tasks.items.filter((t) => !t.completed)
      parts.push(`Tarefas por concluir (${incomplete.length}):`)
      parts.push(formatTaskBullets(incomplete, false))
    }

    yesterdayText = parts.join('\n')
  }

  // ── Today ──
  let todayText: string
  const tHasData = today.tasks.total > 0 || today.timeBlocks.count > 0

  if (!tHasData) {
    todayText = 'Sem tarefas planeadas — dia livre para planear.'
  } else {
    const parts: string[] = []

    if (today.tasks.total > 0) {
      parts.push(`Tarefas planeadas (${today.tasks.total}):`)
      parts.push(formatTaskBullets(today.tasks.items, false))
    }

    if (today.timeBlocks.count > 0) {
      parts.push(`Blocos agendados (${formatMinutes(today.timeBlocks.totalMinutes)} total):`)
      parts.push(formatBlockBullets(today.timeBlocks.items))
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
- Retorna APENAS um JSON com as keys: "yesterday", "today", "blockers"
- Cada valor é uma string com bullets formatados
- Max 1024 tokens`

function buildUserPrompt(yesterday: DaySnapshot, today: DaySnapshot): string {
  return `Dados de ontem (${yesterday.date}):
- Tarefas: ${yesterday.tasks.completed}/${yesterday.tasks.total} concluídas
${yesterday.tasks.items.map((t) => `  - ${t.completed ? '[x]' : '[ ]'} ${t.text}${t.subtasksTotal > 0 ? ` (${t.subtasksDone}/${t.subtasksTotal} sub)` : ''}`).join('\n')}
- Blocos de tempo: ${yesterday.timeBlocks.count} (${formatMinutes(yesterday.timeBlocks.totalMinutes)})
${yesterday.timeBlocks.items.map((b) => `  - ${formatTime(b.startTime)}-${formatTime(b.endTime)} ${b.title}`).join('\n')}
- Pomodoros: ${yesterday.pomodoros}

Dados de hoje (${today.date}):
- Tarefas planeadas: ${today.tasks.total}
${today.tasks.items.map((t) => `  - ${t.completed ? '[x]' : '[ ]'} ${t.text}`).join('\n')}
- Blocos agendados: ${today.timeBlocks.count} (${formatMinutes(today.timeBlocks.totalMinutes)})
${today.timeBlocks.items.map((b) => `  - ${formatTime(b.startTime)}-${formatTime(b.endTime)} ${b.title}`).join('\n')}

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
