import { addDays, format, parseISO } from 'date-fns'
import { useTaskStore, type Task } from '../stores/taskStore'
import { usePomodoroStore } from '../stores/pomodoroStore'
import { useTimeBlockStore } from '../stores/timeBlockStore'

export interface WeekStats {
  weekStart: string
  weekEnd: string
  totalTasks: number
  completedTasks: number
  pendingTasks: number
  completionRate: number
  totalDistractions: number
  totalBlocks: number
  totalBlockMinutes: number
  totalPomodoros: number
  daysWithActivity: number
}

export interface MigrationItem {
  taskId: string
  storeKey: string       // date or date__block__id
  originDate: string
  blockId: string | null
  titleSnapshot: string
}

function eachDateInWeek(weekStart: string, weekEnd: string): string[] {
  const start = parseISO(weekStart)
  const end = parseISO(weekEnd)
  const dates: string[] = []
  let cursor = start
  while (cursor <= end) {
    dates.push(format(cursor, 'yyyy-MM-dd'))
    cursor = addDays(cursor, 1)
  }
  return dates
}

function flattenTasks(list: Task[]): Task[] {
  const out: Task[] = []
  for (const t of list) {
    out.push(t)
    if (t.subtasks.length > 0) out.push(...flattenTasks(t.subtasks))
  }
  return out
}

function isDateKey(storeKey: string, dates: Set<string>): boolean {
  // Either an exact date "YYYY-MM-DD" or a block key "YYYY-MM-DD__block__<uuid>"
  const date = storeKey.includes('__block__') ? storeKey.split('__block__')[0] : storeKey
  return dates.has(date)
}

function originDateOf(storeKey: string): string {
  return storeKey.includes('__block__') ? storeKey.split('__block__')[0] : storeKey
}

function blockIdOf(storeKey: string): string | null {
  if (!storeKey.includes('__block__')) return null
  return storeKey.split('__block__')[1] ?? null
}

export function computeWeekStats(weekStart: string, weekEnd: string): WeekStats {
  const dates = new Set(eachDateInWeek(weekStart, weekEnd))
  const taskStore = useTaskStore.getState()
  const pomoStore = usePomodoroStore.getState()
  const blockStore = useTimeBlockStore.getState()

  let totalTasks = 0
  let completedTasks = 0
  const activityDates = new Set<string>()

  for (const [storeKey, list] of Object.entries(taskStore.tasks)) {
    if (!isDateKey(storeKey, dates)) continue
    const flat = flattenTasks(list)
    if (flat.length > 0) activityDates.add(originDateOf(storeKey))
    for (const t of flat) {
      totalTasks++
      if (t.completed) completedTasks++
    }
  }

  let totalDistractions = 0
  for (const [date, list] of Object.entries(taskStore.distractions)) {
    if (!dates.has(date)) continue
    totalDistractions += list.length
  }

  let totalBlocks = 0
  let totalBlockMinutes = 0
  for (const [date, list] of Object.entries(blockStore.blocks)) {
    if (!dates.has(date)) continue
    if (list.length > 0) activityDates.add(date)
    for (const b of list) {
      totalBlocks++
      totalBlockMinutes += Math.max(0, b.endTime - b.startTime)
    }
  }

  let totalPomodoros = 0
  for (const date of Array.from(dates)) {
    totalPomodoros += pomoStore.completedPomodoros[date] ?? 0
  }

  const pendingTasks = totalTasks - completedTasks
  const completionRate = totalTasks === 0 ? 0 : completedTasks / totalTasks

  return {
    weekStart,
    weekEnd,
    totalTasks,
    completedTasks,
    pendingTasks,
    completionRate,
    totalDistractions,
    totalBlocks,
    totalBlockMinutes,
    totalPomodoros,
    daysWithActivity: activityDates.size
  }
}

export function getMigrationItems(weekStart: string, weekEnd: string): MigrationItem[] {
  const dates = new Set(eachDateInWeek(weekStart, weekEnd))
  const taskStore = useTaskStore.getState()
  const items: MigrationItem[] = []

  for (const [storeKey, list] of Object.entries(taskStore.tasks)) {
    if (!isDateKey(storeKey, dates)) continue
    for (const t of flattenTasks(list)) {
      if (t.completed) continue
      items.push({
        taskId: t.id,
        storeKey,
        originDate: originDateOf(storeKey),
        blockId: blockIdOf(storeKey),
        titleSnapshot: t.text
      })
    }
  }

  return items
}

export interface CompletedTaskItem {
  taskId: string
  date: string
  blockId: string | null
  title: string
}

/** Completed tasks for the week, ordered by date. */
export function getCompletedTaskItems(weekStart: string, weekEnd: string): CompletedTaskItem[] {
  const dates = new Set(eachDateInWeek(weekStart, weekEnd))
  const taskStore = useTaskStore.getState()
  const items: CompletedTaskItem[] = []

  for (const [storeKey, list] of Object.entries(taskStore.tasks)) {
    if (!isDateKey(storeKey, dates)) continue
    for (const t of flattenTasks(list)) {
      if (!t.completed) continue
      items.push({
        taskId: t.id,
        date: originDateOf(storeKey),
        blockId: blockIdOf(storeKey),
        title: t.text
      })
    }
  }

  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return items
}
