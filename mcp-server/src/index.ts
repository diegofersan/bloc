#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import {
  listDayFiles,
  readDay,
  writeDay,
  emptyDay,
  getBasePath
} from './storage.js'
import type {
  TaskData,
  TimeBlockData,
  TimeBlockColor,
  DayFileData
} from './markdown.js'

// --- Helpers ---

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getMonday(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
  d.setDate(diff)
  return d
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekDates(dateStr: string): string[] {
  const monday = getMonday(dateStr)
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    dates.push(formatDate(d))
  }
  return dates
}

/** Convert "HH:MM" to ms from midnight. Throws on invalid input. */
function timeToMs(time: string): number {
  const match = time.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) throw new Error(`Invalid time format "${time}" — expected HH:MM (e.g. "09:30", "14:00")`)
  const h = Number(match[1])
  const m = Number(match[2])
  if (h < 0 || h > 23) throw new Error(`Invalid hour ${h} — must be 0-23`)
  if (m < 0 || m > 59) throw new Error(`Invalid minute ${m} — must be 0-59`)
  return (h * 60 + m) * 60 * 1000
}

const MIN_BLOCK_DURATION_MS = 15 * 60 * 1000 // 15 minutes
const EARLIEST_HOUR = 6  // 06:00
const LATEST_HOUR = 23   // 23:00

/** Check if two time ranges overlap */
function blocksOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

function getOrCreateDay(date: string): DayFileData {
  return readDay(date) ?? emptyDay(date)
}

function findTask(tasks: TaskData[], taskId: string): TaskData | null {
  for (const t of tasks) {
    if (t.id === taskId) return t
    const sub = findTask(t.subtasks, taskId)
    if (sub) return sub
  }
  return null
}

function removeTask(tasks: TaskData[], taskId: string): boolean {
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].id === taskId) {
      tasks.splice(i, 1)
      return true
    }
    if (removeTask(tasks[i].subtasks, taskId)) return true
  }
  return false
}

function formatDaySummary(data: DayFileData): string {
  const lines: string[] = []
  lines.push(`# ${data.date}`)
  const now = new Date()
  lines.push(`Current time: ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
  lines.push(`Pomodoros: ${data.pomodoros}`)
  lines.push('')

  if (data.tasks.length > 0) {
    lines.push('## Tasks')
    for (const t of data.tasks) {
      lines.push(formatTaskSummary(t, 0))
    }
    lines.push('')
  }

  if (data.distractions.length > 0) {
    lines.push('## Distractions')
    for (const d of data.distractions) {
      lines.push(`- [${d.status}] ${d.text} (id: ${d.id})`)
    }
    lines.push('')
  }

  if (data.timeBlocks && data.timeBlocks.length > 0) {
    lines.push('## Time Blocks')
    for (const b of data.timeBlocks) {
      const start = msToTime(b.startTime)
      const end = msToTime(b.endTime)
      lines.push(`- ${start}-${end} ${b.title} [${b.color}] (id: ${b.id})`)
    }
    lines.push('')
  }

  if (data.blockTasks && Object.keys(data.blockTasks).length > 0) {
    lines.push('## Block Tasks')
    for (const [blockId, tasks] of Object.entries(data.blockTasks)) {
      const block = data.timeBlocks?.find(b => b.id === blockId)
      lines.push(`### ${block?.title ?? blockId} (block: ${blockId})`)
      for (const t of tasks) {
        lines.push(formatTaskSummary(t, 0))
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

function formatTaskSummary(task: TaskData, indent: number): string {
  const prefix = '  '.repeat(indent)
  const check = task.completed ? '[x]' : '[ ]'
  let line = `${prefix}- ${check} ${task.text} (id: ${task.id})`
  for (const sub of task.subtasks) {
    line += '\n' + formatTaskSummary(sub, indent + 1)
  }
  return line
}

function msToTime(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// --- MCP Server ---

const server = new McpServer(
  {
    name: 'bloc',
    version: '1.0.0'
  },
  {
    instructions: `Bloc is a daily time-blocking and productivity app. Time blocks represent scheduled work periods on a visual timeline.

CRITICAL RULES for time blocks:
1. ALWAYS call read_day BEFORE creating or modifying blocks — you need to see what already exists to avoid conflicts.
2. Times use 24h HH:MM format. Typical working hours are 07:00–22:00. NEVER create blocks at 00:00 unless the user explicitly asks for midnight.
3. Each block needs a meaningful title — never leave it empty or "Sem título".
4. Blocks CANNOT overlap. If a slot is taken, choose a different time.
5. When the user asks to schedule something without specifying a time, ask them what time they want — do NOT guess or default to 00:00.
6. When the user asks to delete or modify a block, call read_day first to get the block ID.

The user's locale is Portuguese (PT).`
  }
)

// list_days
server.tool(
  'list_days',
  'List all available dates that have Bloc data files',
  {},
  async () => {
    const dates = listDayFiles()
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ dates, count: dates.length, path: getBasePath() }, null, 2)
      }]
    }
  }
)

// read_day
server.tool(
  'read_day',
  'Read all data for a specific date (tasks, blocks, pomodoros, distractions)',
  { date: z.string().describe('Date in YYYY-MM-DD format') },
  async ({ date }) => {
    const data = readDay(date)
    if (!data) {
      return { content: [{ type: 'text', text: `No data found for ${date}` }] }
    }
    return { content: [{ type: 'text', text: formatDaySummary(data) }] }
  }
)

// read_week
server.tool(
  'read_week',
  'Read data for a full week (Monday to Sunday)',
  { date: z.string().optional().describe('Any date in the week (YYYY-MM-DD). Defaults to today.') },
  async ({ date }) => {
    const target = date ?? todayStr()
    const weekDates = getWeekDates(target)
    const lines: string[] = [`# Week of ${weekDates[0]} to ${weekDates[6]}`, '']

    for (const d of weekDates) {
      const data = readDay(d)
      if (data) {
        lines.push(formatDaySummary(data))
        lines.push('---')
        lines.push('')
      }
    }

    if (lines.length <= 2) {
      return { content: [{ type: 'text', text: `No data found for week of ${target}` }] }
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] }
  }
)

// create_task
server.tool(
  'create_task',
  'Create a new task for a given date. Optionally inside a specific time block.',
  {
    date: z.string().describe('Date in YYYY-MM-DD format'),
    text: z.string().describe('Task text'),
    block_id: z.string().optional().describe('Time block ID to create the task inside (optional)')
  },
  async ({ date, text, block_id }) => {
    const data = getOrCreateDay(date)
    const task: TaskData = {
      id: uuidv4(),
      text,
      completed: false,
      createdAt: Date.now(),
      subtasks: []
    }

    if (block_id) {
      if (!data.blockTasks) data.blockTasks = {}
      if (!data.blockTasks[block_id]) data.blockTasks[block_id] = []
      data.blockTasks[block_id].push(task)
    } else {
      data.tasks.push(task)
    }

    writeDay(data)
    return {
      content: [{
        type: 'text',
        text: `Created task "${text}" (id: ${task.id}) on ${date}${block_id ? ` in block ${block_id}` : ''}`
      }]
    }
  }
)

// complete_task
server.tool(
  'complete_task',
  'Mark a task as completed',
  {
    date: z.string().describe('Date in YYYY-MM-DD format'),
    task_id: z.string().describe('Task ID'),
    block_id: z.string().optional().describe('Time block ID if task is inside a block')
  },
  async ({ date, task_id, block_id }) => {
    const data = readDay(date)
    if (!data) {
      return { content: [{ type: 'text', text: `No data found for ${date}` }], isError: true }
    }

    let task: TaskData | null = null
    if (block_id && data.blockTasks?.[block_id]) {
      task = findTask(data.blockTasks[block_id], task_id)
    } else {
      task = findTask(data.tasks, task_id)
    }

    if (!task) {
      return { content: [{ type: 'text', text: `Task ${task_id} not found on ${date}` }], isError: true }
    }

    task.completed = true
    task.completedAt = Date.now()
    writeDay(data)
    return {
      content: [{
        type: 'text',
        text: `Completed task "${task.text}" (id: ${task_id})`
      }]
    }
  }
)

// delete_task
server.tool(
  'delete_task',
  'Remove a task',
  {
    date: z.string().describe('Date in YYYY-MM-DD format'),
    task_id: z.string().describe('Task ID'),
    block_id: z.string().optional().describe('Time block ID if task is inside a block')
  },
  async ({ date, task_id, block_id }) => {
    const data = readDay(date)
    if (!data) {
      return { content: [{ type: 'text', text: `No data found for ${date}` }], isError: true }
    }

    let removed = false
    if (block_id && data.blockTasks?.[block_id]) {
      removed = removeTask(data.blockTasks[block_id], task_id)
    } else {
      removed = removeTask(data.tasks, task_id)
    }

    if (!removed) {
      return { content: [{ type: 'text', text: `Task ${task_id} not found on ${date}` }], isError: true }
    }

    writeDay(data)
    return { content: [{ type: 'text', text: `Deleted task ${task_id} from ${date}` }] }
  }
)

// create_time_block
server.tool(
  'create_time_block',
  `Create a new time block on the user's daily timeline.

IMPORTANT RULES — read carefully:
- You MUST call read_day first to check existing blocks and available slots.
- start_time and end_time are CLOCK TIMES in HH:MM 24-hour format, e.g. "09:00" means 9 AM, "14:30" means 2:30 PM.
- Blocks must be within working hours (06:00 to 23:00). Blocks at 00:00–06:00 are rejected.
- If the user does not specify a time, ASK them — do NOT guess or use 00:00.
- Minimum block duration is 15 minutes. Blocks cannot overlap.`,
  {
    date: z.string().describe('Date in YYYY-MM-DD format'),
    title: z.string().min(1).describe('Block title — must not be empty'),
    start_time: z.string().regex(/^\d{2}:\d{2}$/).describe('Start CLOCK TIME in HH:MM 24h format. Example: "09:00" for 9 AM, "14:30" for 2:30 PM. NOT milliseconds, NOT minutes — a clock time.'),
    end_time: z.string().regex(/^\d{2}:\d{2}$/).describe('End CLOCK TIME in HH:MM 24h format. Example: "10:30" for 10:30 AM, "16:00" for 4 PM. Must be after start_time.'),
    color: z.enum(['indigo', 'emerald', 'amber', 'rose', 'sky', 'violet', 'slate']).optional().describe('Block color (default: indigo)')
  },
  async ({ date, title, start_time, end_time, color }) => {
    // Validate times
    let startMs: number, endMs: number
    try {
      startMs = timeToMs(start_time)
      endMs = timeToMs(end_time)
    } catch (e: any) {
      return { content: [{ type: 'text', text: e.message }], isError: true }
    }

    // Reject blocks outside working hours (00:00–06:00)
    const startHour = startMs / 3600000
    const endHour = endMs / 3600000
    if (startHour < EARLIEST_HOUR) {
      return {
        content: [{ type: 'text', text: `Start time ${start_time} is before 06:00. Blocks must be between 06:00 and 23:00. Did you mean a different time?` }],
        isError: true
      }
    }
    if (endHour > LATEST_HOUR + 1) { // allow end at 23:59
      return {
        content: [{ type: 'text', text: `End time ${end_time} is after 23:59. Blocks must be between 06:00 and 23:00.` }],
        isError: true
      }
    }

    if (endMs <= startMs) {
      return {
        content: [{ type: 'text', text: `End time (${end_time}) must be after start time (${start_time})` }],
        isError: true
      }
    }

    if (endMs - startMs < MIN_BLOCK_DURATION_MS) {
      return {
        content: [{ type: 'text', text: `Block duration must be at least 15 minutes. Got ${start_time}-${end_time} (${(endMs - startMs) / 60000}min)` }],
        isError: true
      }
    }

    const data = getOrCreateDay(date)
    if (!data.timeBlocks) data.timeBlocks = []

    // Check for overlaps
    const overlapping = data.timeBlocks.find(b => blocksOverlap(startMs, endMs, b.startTime, b.endTime))
    if (overlapping) {
      return {
        content: [{
          type: 'text',
          text: `Time conflict: "${title}" (${start_time}-${end_time}) overlaps with existing block "${overlapping.title}" (${msToTime(overlapping.startTime)}-${msToTime(overlapping.endTime)}). Use read_day to see all existing blocks, then choose a free slot.`
        }],
        isError: true
      }
    }

    const now = Date.now()
    const block: TimeBlockData = {
      id: uuidv4(),
      title,
      startTime: startMs,
      endTime: endMs,
      color: (color as TimeBlockColor) ?? 'indigo',
      createdAt: now,
      updatedAt: now
    }

    data.timeBlocks.push(block)
    writeDay(data)
    return {
      content: [{
        type: 'text',
        text: `Created time block "${title}" ${start_time}-${end_time} [${block.color}] (id: ${block.id}) on ${date}`
      }]
    }
  }
)

// update_time_block
server.tool(
  'update_time_block',
  'Update an existing time block. Time changes are validated for overlaps with other blocks.',
  {
    date: z.string().describe('Date in YYYY-MM-DD format'),
    block_id: z.string().describe('Block ID'),
    title: z.string().optional().describe('New title'),
    start_time: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('New start CLOCK TIME in HH:MM 24h format (e.g. "09:00")'),
    end_time: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('New end CLOCK TIME in HH:MM 24h format (e.g. "10:30")'),
    color: z.enum(['indigo', 'emerald', 'amber', 'rose', 'sky', 'violet', 'slate']).optional().describe('New color')
  },
  async ({ date, block_id, title, start_time, end_time, color }) => {
    const data = readDay(date)
    if (!data) {
      return { content: [{ type: 'text', text: `No data found for ${date}` }], isError: true }
    }

    const block = data.timeBlocks?.find(b => b.id === block_id)
    if (!block) {
      return { content: [{ type: 'text', text: `Block ${block_id} not found on ${date}` }], isError: true }
    }

    // Parse new times or keep existing
    let newStart = block.startTime
    let newEnd = block.endTime
    try {
      if (start_time !== undefined) newStart = timeToMs(start_time)
      if (end_time !== undefined) newEnd = timeToMs(end_time)
    } catch (e: any) {
      return { content: [{ type: 'text', text: e.message }], isError: true }
    }

    if (newEnd <= newStart) {
      return {
        content: [{ type: 'text', text: `End time must be after start time` }],
        isError: true
      }
    }

    if (newEnd - newStart < MIN_BLOCK_DURATION_MS) {
      return {
        content: [{ type: 'text', text: `Block duration must be at least 15 minutes` }],
        isError: true
      }
    }

    // Check overlaps with other blocks (excluding self)
    if (start_time !== undefined || end_time !== undefined) {
      const overlapping = data.timeBlocks?.find(b =>
        b.id !== block_id && blocksOverlap(newStart, newEnd, b.startTime, b.endTime)
      )
      if (overlapping) {
        return {
          content: [{
            type: 'text',
            text: `Time conflict: updated times overlap with "${overlapping.title}" (${msToTime(overlapping.startTime)}-${msToTime(overlapping.endTime)})`
          }],
          isError: true
        }
      }
    }

    if (title !== undefined) block.title = title
    block.startTime = newStart
    block.endTime = newEnd
    if (color !== undefined) block.color = color as TimeBlockColor
    block.updatedAt = Date.now()

    writeDay(data)
    return {
      content: [{
        type: 'text',
        text: `Updated time block "${block.title}" (id: ${block_id})`
      }]
    }
  }
)

// delete_time_block
server.tool(
  'delete_time_block',
  'Remove a time block',
  {
    date: z.string().describe('Date in YYYY-MM-DD format'),
    block_id: z.string().describe('Block ID')
  },
  async ({ date, block_id }) => {
    const data = readDay(date)
    if (!data) {
      return { content: [{ type: 'text', text: `No data found for ${date}` }], isError: true }
    }

    const idx = data.timeBlocks?.findIndex(b => b.id === block_id) ?? -1
    if (idx === -1) {
      return { content: [{ type: 'text', text: `Block ${block_id} not found on ${date}` }], isError: true }
    }

    data.timeBlocks!.splice(idx, 1)
    // Also remove associated block tasks
    if (data.blockTasks?.[block_id]) {
      delete data.blockTasks[block_id]
    }

    writeDay(data)
    return { content: [{ type: 'text', text: `Deleted time block ${block_id} from ${date}` }] }
  }
)

// get_stats
server.tool(
  'get_stats',
  'Get productivity statistics for a day, week, or month',
  {
    date: z.string().optional().describe('Date in YYYY-MM-DD format (defaults to today)'),
    range: z.enum(['day', 'week', 'month']).optional().describe('Range: day, week, or month (defaults to day)')
  },
  async ({ date, range }) => {
    const target = date ?? todayStr()
    const period = range ?? 'day'

    let dates: string[]
    if (period === 'day') {
      dates = [target]
    } else if (period === 'week') {
      dates = getWeekDates(target)
    } else {
      // month: all days in the month
      const [y, m] = target.split('-').map(Number)
      const daysInMonth = new Date(y, m, 0).getDate()
      dates = []
      for (let d = 1; d <= daysInMonth; d++) {
        dates.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
      }
    }

    let totalPomodoros = 0
    let totalTasks = 0
    let completedTasks = 0
    let totalDistractions = 0
    let totalBlocks = 0
    let totalBlockMinutes = 0
    let daysWithData = 0

    function countTasks(tasks: TaskData[]): { total: number; completed: number } {
      let total = 0
      let completed = 0
      for (const t of tasks) {
        total++
        if (t.completed) completed++
        const sub = countTasks(t.subtasks)
        total += sub.total
        completed += sub.completed
      }
      return { total, completed }
    }

    for (const d of dates) {
      const data = readDay(d)
      if (!data) continue
      daysWithData++

      totalPomodoros += data.pomodoros

      const taskCounts = countTasks(data.tasks)
      totalTasks += taskCounts.total
      completedTasks += taskCounts.completed

      // Count block tasks too
      if (data.blockTasks) {
        for (const tasks of Object.values(data.blockTasks)) {
          const bc = countTasks(tasks)
          totalTasks += bc.total
          completedTasks += bc.completed
        }
      }

      totalDistractions += data.distractions.length

      if (data.timeBlocks) {
        totalBlocks += data.timeBlocks.length
        for (const b of data.timeBlocks) {
          totalBlockMinutes += (b.endTime - b.startTime) / 60000
        }
      }
    }

    const stats = {
      period,
      dateRange: dates.length === 1 ? target : `${dates[0]} to ${dates[dates.length - 1]}`,
      daysWithData,
      pomodoros: totalPomodoros,
      tasks: { total: totalTasks, completed: completedTasks, completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) + '%' : 'N/A' },
      distractions: totalDistractions,
      timeBlocks: { count: totalBlocks, totalMinutes: Math.round(totalBlockMinutes) },
      focusTime: `${Math.round(totalPomodoros * 25)}min (${(totalPomodoros * 25 / 60).toFixed(1)}h)`
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }]
    }
  }
)

// --- Start ---

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
