import type { TaskCategory, TaskSize, ComplexityScore, ExpansionDecision } from './expansionTypes'

const CONNECTORS = ['e', 'depois', 'além de', 'também', 'incluindo', 'assim como', 'bem como']

const CATEGORY_KEYWORDS: Record<Exclude<TaskCategory, 'generic'>, string[]> = {
  technical: [
    'deploy', 'refactor', 'migrar', 'configurar', 'instalar', 'implementar',
    'debugar', 'testar', 'compilar', 'commit', 'push', 'merge', 'api',
    'database', 'servidor', 'backend', 'frontend', 'ci/cd', 'pipeline',
    'docker', 'build', 'setup', 'code', 'bug', 'fix'
  ],
  administrative: [
    'email', 'responder', 'enviar', 'agendar', 'reunião', 'ligar',
    'contactar', 'marcar', 'confirmar', 'pagar', 'factura', 'formulário',
    'documento', 'assinar', 'organizar', 'arquivar', 'meeting'
  ],
  creative: [
    'desenhar', 'design', 'escrever', 'redigir', 'criar', 'compor',
    'ilustrar', 'prototipar', 'wireframe', 'mockup', 'logo', 'layout',
    'artigo', 'post', 'vídeo', 'fotografia', 'editar'
  ],
  analytical: [
    'analisar', 'avaliar', 'comparar', 'investigar', 'medir', 'calcular',
    'relatório', 'report', 'dados', 'métricas', 'estatísticas', 'benchmark',
    'audit', 'review', 'rever', 'diagnosticar'
  ],
  learning: [
    'estudar', 'aprender', 'curso', 'tutorial', 'ler', 'livro',
    'praticar', 'exercício', 'formação', 'workshop', 'certificação',
    'treinar', 'aula', 'lesson'
  ]
}

const ACTION_VERBS_HIGH: string[] = [
  'configurar', 'implementar', 'migrar', 'refactor', 'deploy',
  'construir', 'desenvolver', 'integrar', 'automatizar', 'redesenhar',
  'reestruturar', 'planear', 'organizar', 'preparar',
  'escrever', 'redigir', 'criar', 'compor', 'desenhar', 'prototipar',
  'analisar', 'investigar', 'estudar', 'publicar'
]

const ACTION_VERBS_LOW: string[] = [
  'enviar', 'responder', 'abrir', 'fechar', 'verificar', 'confirmar',
  'ler', 'ver', 'copiar', 'mover', 'apagar', 'ligar'
]

export function inferCategory(text: string): TaskCategory {
  const lower = text.toLowerCase()
  const scores: Partial<Record<TaskCategory, number>> = {}

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const count = keywords.filter(kw => lower.includes(kw)).length
    if (count > 0) {
      scores[category as TaskCategory] = count
    }
  }

  const entries = Object.entries(scores) as [TaskCategory, number][]
  if (entries.length === 0) return 'generic'

  entries.sort((a, b) => b[1] - a[1])
  return entries[0][0]
}

function countConnectors(text: string): number {
  const lower = text.toLowerCase()
  let count = 0
  for (const conn of CONNECTORS) {
    const regex = new RegExp(`\\b${conn}\\b`, 'gi')
    const matches = lower.match(regex)
    if (matches) count += matches.length
  }
  return count
}

function scoreVerbs(text: string): number {
  const lower = text.toLowerCase()
  let score = 0
  for (const verb of ACTION_VERBS_HIGH) {
    if (lower.includes(verb)) score += 2
  }
  for (const verb of ACTION_VERBS_LOW) {
    if (lower.includes(verb)) score += 1
  }
  return score
}

function wordCountToSize(wc: number): TaskSize {
  if (wc < 3) return 'micro'
  if (wc <= 4) return 'small'
  if (wc <= 15) return 'medium'
  if (wc <= 25) return 'large'
  return 'project'
}

function sizeToMinutes(size: TaskSize): number {
  switch (size) {
    case 'micro': return 2
    case 'small': return 10
    case 'medium': return 30
    case 'large': return 120
    case 'project': return 300
  }
}

const SIZE_ORDER: TaskSize[] = ['micro', 'small', 'medium', 'large', 'project']

function bumpSize(size: TaskSize, steps: number): TaskSize {
  const idx = SIZE_ORDER.indexOf(size)
  const newIdx = Math.min(idx + steps, SIZE_ORDER.length - 1)
  return SIZE_ORDER[newIdx]
}

export function estimateSize(score: ComplexityScore): TaskSize {
  return score.size
}

export function scoreComplexity(taskText: string): ComplexityScore {
  const words = taskText.trim().split(/\s+/).filter(w => w.length > 0)
  const wordCount = words.length
  const verbScore = scoreVerbs(taskText)
  const connectorCount = countConnectors(taskText)
  const categoryHint = inferCategory(taskText)

  let size = wordCountToSize(wordCount)

  // Bump size for compound tasks (connectors indicate multiple steps)
  if (connectorCount >= 2) {
    size = bumpSize(size, 2)
  } else if (connectorCount >= 1) {
    size = bumpSize(size, 1)
  }

  // Bump size for high-complexity verbs
  if (verbScore >= 4) {
    size = bumpSize(size, 2)
  } else if (verbScore >= 2) {
    size = bumpSize(size, 1)
  }

  // Bump size if a specific category was detected (non-generic = structured work)
  if (categoryHint !== 'generic' && size === 'small') {
    size = bumpSize(size, 1)
  }

  const estimatedMinutes = sizeToMinutes(size)

  return { wordCount, verbScore, connectorCount, categoryHint, estimatedMinutes, size }
}

export function shouldDecompose(score: ComplexityScore): ExpansionDecision {
  switch (score.size) {
    case 'micro':
      return { shouldExpand: false, reason: 'Tarefa demasiado simples para decompor', suggestedCount: [0, 0] }
    case 'small':
      return { shouldExpand: false, reason: 'Tarefa demasiado simples para decompor', suggestedCount: [0, 0] }
    case 'medium':
      return { shouldExpand: true, suggestedCount: [2, 3] }
    case 'large':
      return { shouldExpand: true, suggestedCount: [3, 5] }
    case 'project':
      return { shouldExpand: true, suggestedCount: [5, 6] }
  }
}
