import type { AIProvider } from '../stores/settingsStore'
import type { ExpansionContext, SubtaskResult } from './expansionTypes'
import { scoreComplexity, shouldDecompose, inferCategory } from './complexityScorer'
import { useTaskStore } from '../stores/taskStore'
import { useTimeBlockStore } from '../stores/timeBlockStore'
import { useExpansionStore } from '../stores/expansionStore'
import { callOpenAI, callAnthropic, callGemini, parseSubtasks } from './aiService'

function extractBlockContext(date: string): { baseDate: string; blockId?: string } {
  const parts = date.split('__block__')
  return { baseDate: parts[0], blockId: parts[1] }
}

const CATEGORY_TEMPLATES: Record<string, string> = {
  creative: 'Inclui fase de ideação e fase de execução.',
  analytical: 'Inclui recolha de dados, análise e conclusão.',
  administrative: 'Foca em acções directas e comunicação.',
  learning: 'Inclui estudo, prática e revisão.',
  technical: 'Inclui setup, implementação e verificação.'
}

export function buildExpansionContext(
  taskText: string,
  date: string,
  taskId: string
): ExpansionContext {
  const { baseDate, blockId } = extractBlockContext(date)

  // Get sibling tasks
  const allTasks = useTaskStore.getState().getTasksForDate(date)
  const siblingTasks = allTasks
    .filter(t => t.id !== taskId)
    .map(t => t.text)
    .filter(t => t.trim().length > 0)

  // Get existing subtasks for this task
  const currentTask = allTasks.find(t => t.id === taskId)
  const existingSubtasks = currentTask?.subtasks.map(s => s.text) ?? []

  // Get block duration if inside a time block
  let blockDuration: number | undefined
  if (blockId) {
    const blocks = useTimeBlockStore.getState().getBlocksForDate(baseDate)
    const block = blocks.find(b => b.id === blockId)
    if (block) {
      blockDuration = block.endTime - block.startTime
    }
  }

  const complexity = scoreComplexity(taskText)
  const category = inferCategory(taskText)
  const profile = useExpansionStore.getState().getProfile()

  return {
    taskText,
    date,
    siblingTasks,
    existingSubtasks,
    blockDuration,
    category,
    complexity,
    userProfile: profile.totalExpansions > 0 ? profile : undefined
  }
}

export function buildSystemPrompt(ctx: ExpansionContext): string {
  const decision = shouldDecompose(ctx.complexity)
  const [min, max] = decision.suggestedCount

  let prompt = `És um especialista em produtividade que aplica a metodologia "Done Means What".
O teu trabalho: decompor uma tarefa em subtarefas concretas e binárias — ou estão FEITAS ou NÃO FEITAS.

Regras:
- Começa cada subtarefa com um verbo de acção (Escrever, Enviar, Criar, Configurar, Instalar, Corrigir, Testar, Deploy, Apagar, Actualizar...)
- Cada subtarefa deve ter um resultado verificável e observável — alguém pode olhar e confirmar que está feito
- Nunca geres subtarefas vagas como "Pensar sobre...", "Considerar...", "Planear..." ou "Investigar..."
- Mantém cada subtarefa concisa: máximo ~12 palavras
- Responde SEMPRE no MESMO IDIOMA da tarefa do utilizador
- Devolve APENAS um array JSON de strings, sem texto ou markdown adicional`

  // Block duration context
  if (ctx.blockDuration) {
    prompt += `\n\nEsta tarefa está num bloco de ${ctx.blockDuration}min. Ajusta a granularidade para caber neste tempo.`
  }

  // Sibling tasks context
  if (ctx.siblingTasks.length > 0) {
    const list = ctx.siblingTasks.slice(0, 5).join(', ')
    prompt += `\n\nOutras tarefas no mesmo contexto: ${list}. Evita sobreposição.`
  }

  // Existing subtasks context
  if (ctx.existingSubtasks.length > 0) {
    const list = ctx.existingSubtasks.join(', ')
    prompt += `\n\nJá existem subtarefas: ${list}. Complementa sem repetir.`
  }

  // Category template
  const template = CATEGORY_TEMPLATES[ctx.category]
  if (template) {
    prompt += `\n\nDica de categoria (${ctx.category}): ${template}`
  }

  // Count guidance
  prompt += `\n\nGera entre ${min} e ${max} subtarefas.`

  return prompt
}

export function buildUserPrompt(ctx: ExpansionContext): string {
  let prompt = `Decompõe esta tarefa em subtarefas feitas-ou-não-feitas:\n${ctx.taskText}`

  if (ctx.complexity.size === 'project') {
    prompt += '\n\n(Esta é uma tarefa grande/projecto — foca nos próximos passos accionáveis, não em todas as fases.)'
  }

  return prompt
}

export async function expandTaskV2(
  taskText: string,
  date: string,
  taskId: string,
  provider: AIProvider,
  apiKey: string,
  model: string
): Promise<SubtaskResult[]> {
  const ctx = buildExpansionContext(taskText, date, taskId)
  const decision = shouldDecompose(ctx.complexity)

  // Pre-filter: don't call LLM for simple tasks
  if (!decision.shouldExpand) {
    throw new Error(decision.reason ?? 'Tarefa demasiado simples para decompor')
  }

  const systemMsg = buildSystemPrompt(ctx)
  const userMsg = buildUserPrompt(ctx)

  try {
    let raw: string
    switch (provider) {
      case 'openai':
        raw = await callOpenAI(systemMsg, userMsg, apiKey, model)
        break
      case 'anthropic':
        raw = await callAnthropic(systemMsg, userMsg, apiKey, model)
        break
      case 'gemini':
        raw = await callGemini(systemMsg, userMsg, apiKey, model)
        break
    }

    const subtaskTexts = parseSubtasks(raw)
    const results: SubtaskResult[] = subtaskTexts.map(text => ({ text }))

    // Track expansion event
    useExpansionStore.getState().recordExpansion({
      taskText,
      category: ctx.category,
      complexitySize: ctx.complexity.size,
      subtasksGenerated: results.length
    })

    return results
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    throw new Error(`Failed to expand task: ${message}`)
  }
}
