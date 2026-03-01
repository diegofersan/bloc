export interface TaskData {
  id: string
  text: string
  completed: boolean
  completedAt?: number
  createdAt: number
  subtasks: TaskData[]
}

export type DistractionStatus = 'pending' | 'dismissed' | 'converted'

export interface DistractionData {
  id: string
  text: string
  createdAt: number
  status: DistractionStatus
  processedAt?: number
}

export type TimeBlockColor = 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet' | 'slate'

export interface TimeBlockData {
  id: string
  startTime: number
  endTime: number
  title: string
  color: TimeBlockColor
  createdAt: number
  updatedAt: number
  googleEventId?: string
  isGoogleReadOnly?: boolean
}

export interface DayFileData {
  date: string
  pomodoros: number
  updatedAt: number
  tasks: TaskData[]
  distractions: DistractionData[]
  timeBlocks?: TimeBlockData[]
}

// --- Serialization ---

function serializeTask(task: TaskData, indent: number): string {
  const prefix = '  '.repeat(indent)
  const checkbox = task.completed ? '[x]' : '[ ]'
  let meta = `@id:${task.id} @created:${task.createdAt}`
  if (task.completed && task.completedAt) {
    meta += ` @completed:${task.completedAt}`
  }
  let line = `${prefix}- ${checkbox} ${task.text} <!--${meta}-->`

  if (task.subtasks.length > 0) {
    const subtaskLines = task.subtasks.map((st) => serializeTask(st, indent + 1))
    line += '\n' + subtaskLines.join('\n')
  }

  return line
}

function serializeDistraction(d: DistractionData): string {
  let meta = `@id:${d.id} @created:${d.createdAt}`
  if (d.processedAt) {
    meta += ` @processed:${d.processedAt}`
  }
  return `- [${d.status}] ${d.text} <!--${meta}-->`
}

function serializeTimeBlock(b: TimeBlockData): string {
  let meta = `@id:${b.id} @start:${b.startTime} @end:${b.endTime} @color:${b.color} @created:${b.createdAt} @updated:${b.updatedAt}`
  if (b.googleEventId) meta += ` @gcalId:${b.googleEventId}`
  if (b.isGoogleReadOnly) meta += ` @gcalReadOnly:true`
  return `- ${b.title} <!--${meta}-->`
}

export function serialize(data: DayFileData): string {
  const lines: string[] = []

  // Frontmatter
  lines.push('---')
  lines.push(`date: ${data.date}`)
  lines.push(`pomodoros: ${data.pomodoros}`)
  lines.push(`updatedAt: ${data.updatedAt}`)
  lines.push('---')
  lines.push('')

  // Tasks
  if (data.tasks.length > 0) {
    lines.push('## Tarefas')
    lines.push('')
    for (const task of data.tasks) {
      lines.push(serializeTask(task, 0))
    }
    lines.push('')
  }

  // Distractions
  if (data.distractions.length > 0) {
    lines.push('## Distrações')
    lines.push('')
    for (const d of data.distractions) {
      lines.push(serializeDistraction(d))
    }
    lines.push('')
  }

  // Time Blocks
  if (data.timeBlocks && data.timeBlocks.length > 0) {
    lines.push('## Blocos de Tempo')
    lines.push('')
    for (const b of data.timeBlocks) {
      lines.push(serializeTimeBlock(b))
    }
    lines.push('')
  }

  return lines.join('\n')
}

// --- Deserialization ---

interface Frontmatter {
  date: string
  pomodoros: number
  updatedAt: number
}

function parseFrontmatter(text: string): { frontmatter: Frontmatter; body: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) {
    return {
      frontmatter: { date: '', pomodoros: 0, updatedAt: 0 },
      body: text
    }
  }

  const yaml = match[1]
  const body = match[2]
  const fm: Frontmatter = { date: '', pomodoros: 0, updatedAt: 0 }

  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    if (key === 'date') fm.date = value
    else if (key === 'pomodoros') fm.pomodoros = parseInt(value, 10) || 0
    else if (key === 'updatedAt') fm.updatedAt = parseInt(value, 10) || 0
  }

  return { frontmatter: fm, body }
}

function parseMetaComment(text: string): Record<string, string> {
  const match = text.match(/<!--(.*?)-->/)
  if (!match) return {}
  const meta: Record<string, string> = {}
  const pairs = match[1].match(/@(\w+):(\S+)/g)
  if (pairs) {
    for (const pair of pairs) {
      const m = pair.match(/@(\w+):(\S+)/)
      if (m) meta[m[1]] = m[2]
    }
  }
  return meta
}

function stripMetaComment(text: string): string {
  return text.replace(/\s*<!--.*?-->/, '').trim()
}

interface ParsedTaskLine {
  indent: number
  completed: boolean
  text: string
  meta: Record<string, string>
}

function parseTaskLine(line: string): ParsedTaskLine | null {
  const match = line.match(/^(\s*)- \[(x| )\] (.+)$/)
  if (!match) return null
  const indent = match[1].length / 2
  const completed = match[2] === 'x'
  const rawText = match[3]
  const meta = parseMetaComment(rawText)
  const text = stripMetaComment(rawText)
  return { indent, completed, text, meta }
}

function buildTaskData(parsed: ParsedTaskLine): TaskData {
  return {
    id: parsed.meta.id || crypto.randomUUID(),
    text: parsed.text,
    completed: parsed.completed,
    completedAt: parsed.meta.completed ? parseInt(parsed.meta.completed, 10) : undefined,
    createdAt: parsed.meta.created ? parseInt(parsed.meta.created, 10) : Date.now(),
    subtasks: []
  }
}

function parseTasksSection(lines: string[]): TaskData[] {
  const tasks: TaskData[] = []
  const stack: { task: TaskData; indent: number }[] = []

  for (const line of lines) {
    const parsed = parseTaskLine(line)
    if (!parsed) continue

    const task = buildTaskData(parsed)

    // Pop stack to find correct parent
    while (stack.length > 0 && stack[stack.length - 1].indent >= parsed.indent) {
      stack.pop()
    }

    if (stack.length === 0) {
      tasks.push(task)
    } else {
      stack[stack.length - 1].task.subtasks.push(task)
    }

    stack.push({ task, indent: parsed.indent })
  }

  return tasks
}

interface ParsedDistraction {
  status: DistractionStatus
  text: string
  meta: Record<string, string>
}

function parseDistractionLine(line: string): ParsedDistraction | null {
  const match = line.match(/^- \[(pending|dismissed|converted)\] (.+)$/)
  if (!match) return null
  const status = match[1] as DistractionStatus
  const rawText = match[2]
  const meta = parseMetaComment(rawText)
  const text = stripMetaComment(rawText)
  return { status, text, meta }
}

function parseDistractionsSection(lines: string[]): DistractionData[] {
  const distractions: DistractionData[] = []
  for (const line of lines) {
    const parsed = parseDistractionLine(line)
    if (!parsed) continue
    distractions.push({
      id: parsed.meta.id || crypto.randomUUID(),
      text: parsed.text,
      createdAt: parsed.meta.created ? parseInt(parsed.meta.created, 10) : Date.now(),
      status: parsed.status,
      processedAt: parsed.meta.processed ? parseInt(parsed.meta.processed, 10) : undefined
    })
  }
  return distractions
}

function parseTimeBlockLine(line: string): TimeBlockData | null {
  const match = line.match(/^- (.+?)\s*<!--(.+?)-->/)
  if (!match) return null
  const title = match[1].trim()
  const meta = parseMetaComment(line)
  if (!meta.start || !meta.end) return null
  return {
    id: meta.id || crypto.randomUUID(),
    startTime: parseInt(meta.start, 10),
    endTime: parseInt(meta.end, 10),
    title,
    color: (meta.color as TimeBlockColor) || 'indigo',
    createdAt: meta.created ? parseInt(meta.created, 10) : Date.now(),
    updatedAt: meta.updated ? parseInt(meta.updated, 10) : Date.now(),
    googleEventId: meta.gcalId,
    isGoogleReadOnly: meta.gcalReadOnly === 'true'
  }
}

function parseTimeBlocksSection(lines: string[]): TimeBlockData[] {
  const blocks: TimeBlockData[] = []
  for (const line of lines) {
    const parsed = parseTimeBlockLine(line)
    if (parsed) blocks.push(parsed)
  }
  return blocks
}

export function deserialize(content: string): DayFileData {
  const { frontmatter, body } = parseFrontmatter(content)

  let tasks: TaskData[] = []
  let distractions: DistractionData[] = []
  let timeBlocks: TimeBlockData[] = []

  // Split body into sections
  const sections = body.split(/^## /m)
  for (const section of sections) {
    if (section.startsWith('Tarefas')) {
      const lines = section.split('\n').slice(1)
      tasks = parseTasksSection(lines)
    } else if (section.startsWith('Distrações')) {
      const lines = section.split('\n').slice(1)
      distractions = parseDistractionsSection(lines)
    } else if (section.startsWith('Blocos de Tempo')) {
      const lines = section.split('\n').slice(1)
      timeBlocks = parseTimeBlocksSection(lines)
    }
  }

  return {
    date: frontmatter.date,
    pomodoros: frontmatter.pomodoros,
    updatedAt: frontmatter.updatedAt,
    tasks,
    distractions,
    timeBlocks
  }
}
