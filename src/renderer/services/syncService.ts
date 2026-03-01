import { useTaskStore } from '../stores/taskStore'
import { usePomodoroStore } from '../stores/pomodoroStore'
import type { Task, Distraction } from '../stores/taskStore'

interface TaskData {
  id: string
  text: string
  completed: boolean
  completedAt?: number
  createdAt: number
  subtasks: TaskData[]
}

interface DistractionData {
  id: string
  text: string
  createdAt: number
  status: 'pending' | 'dismissed' | 'converted'
  processedAt?: number
}

interface DayFileData {
  date: string
  pomodoros: number
  updatedAt: number
  tasks: TaskData[]
  distractions: DistractionData[]
}

const SYNC_MIGRATED_KEY = 'bloc-icloud-migrated'
let unsubscribeTasks: (() => void) | null = null
let unsubscribePomodoro: (() => void) | null = null
let cleanupFileChanged: (() => void) | null = null
let debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
let icloudAvailable = false

// --- Conversion helpers ---

function taskToData(task: Task): TaskData {
  return {
    id: task.id,
    text: task.text,
    completed: task.completed,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    subtasks: task.subtasks.map(taskToData)
  }
}

function dataToTask(data: TaskData, date: string): Task {
  return {
    id: data.id,
    text: data.text,
    completed: data.completed,
    completedAt: data.completedAt,
    createdAt: data.createdAt,
    date,
    subtasks: data.subtasks.map((st) => dataToTask(st, date))
  }
}

function distractionToData(d: Distraction): DistractionData {
  return {
    id: d.id,
    text: d.text,
    createdAt: d.createdAt,
    status: d.status,
    processedAt: d.processedAt
  }
}

function dataToDistraction(data: DistractionData, date: string): Distraction {
  return {
    id: data.id,
    text: data.text,
    createdAt: data.createdAt,
    sourceDate: date,
    status: data.status,
    processedAt: data.processedAt
  }
}

// --- Core sync functions ---

function buildDayFileData(date: string): DayFileData {
  const tasks = useTaskStore.getState().tasks[date] || []
  const distractions = useTaskStore.getState().distractions[date] || []
  const pomodoros = usePomodoroStore.getState().completedPomodoros[date] || 0

  return {
    date,
    pomodoros,
    updatedAt: Date.now(),
    tasks: tasks.map(taskToData),
    distractions: distractions.map(distractionToData)
  }
}

function writeDayToICloud(date: string): void {
  if (!icloudAvailable) return
  const data = buildDayFileData(date)
  window.bloc?.icloud.writeDay(data)
}

function debouncedWrite(date: string): void {
  const existing = debounceTimers.get(date)
  if (existing) clearTimeout(existing)
  debounceTimers.set(
    date,
    setTimeout(() => {
      debounceTimers.delete(date)
      writeDayToICloud(date)
    }, 500)
  )
}

function applyExternalChange(data: DayFileData): void {
  const taskState = useTaskStore.getState()
  const pomodoroState = usePomodoroStore.getState()

  // Check updatedAt — last-write-wins
  const currentData = buildDayFileData(data.date)
  if (currentData.updatedAt > data.updatedAt) return

  // Apply tasks
  const newTasks = data.tasks.map((t) => dataToTask(t, data.date))
  useTaskStore.setState({
    tasks: { ...taskState.tasks, [data.date]: newTasks }
  })

  // Apply distractions
  const newDistractions = data.distractions.map((d) => dataToDistraction(d, data.date))
  useTaskStore.setState({
    distractions: { ...taskState.distractions, [data.date]: newDistractions }
  })

  // Apply pomodoros
  if (data.pomodoros !== (pomodoroState.completedPomodoros[data.date] || 0)) {
    usePomodoroStore.setState({
      completedPomodoros: {
        ...pomodoroState.completedPomodoros,
        [data.date]: data.pomodoros
      }
    })
  }
}

// --- Migration ---

async function migrateLocalStorageToICloud(): Promise<void> {
  const taskState = useTaskStore.getState()
  const pomodoroState = usePomodoroStore.getState()

  const allDates = new Set<string>()
  for (const date of Object.keys(taskState.tasks)) allDates.add(date)
  for (const date of Object.keys(taskState.distractions)) allDates.add(date)
  for (const date of Object.keys(pomodoroState.completedPomodoros)) allDates.add(date)

  for (const date of allDates) {
    writeDayToICloud(date)
  }

  localStorage.setItem(SYNC_MIGRATED_KEY, 'true')
}

async function loadAllFromICloud(): Promise<void> {
  const allDays: DayFileData[] | undefined = await window.bloc?.icloud.readAllDays()
  if (!allDays) return

  const newTasks: Record<string, Task[]> = {}
  const newDistractions: Record<string, Distraction[]> = {}
  const newPomodoros: Record<string, number> = {}

  for (const day of allDays) {
    if (day.tasks.length > 0) {
      newTasks[day.date] = day.tasks.map((t) => dataToTask(t, day.date))
    }
    if (day.distractions.length > 0) {
      newDistractions[day.date] = day.distractions.map((d) => dataToDistraction(d, day.date))
    }
    if (day.pomodoros > 0) {
      newPomodoros[day.date] = day.pomodoros
    }
  }

  // Merge with existing local data — iCloud takes precedence
  const taskState = useTaskStore.getState()
  const pomodoroState = usePomodoroStore.getState()

  useTaskStore.setState({
    tasks: { ...taskState.tasks, ...newTasks },
    distractions: { ...taskState.distractions, ...newDistractions }
  })

  usePomodoroStore.setState({
    completedPomodoros: { ...pomodoroState.completedPomodoros, ...newPomodoros }
  })
}

// --- Store subscriptions ---

function getChangedDates(
  prev: Record<string, unknown[]>,
  next: Record<string, unknown[]>
): string[] {
  const changed: string[] = []
  const allDates = new Set([...Object.keys(prev), ...Object.keys(next)])
  for (const date of allDates) {
    if (prev[date] !== next[date]) {
      changed.push(date)
    }
  }
  return changed
}

function subscribeToStoreChanges(): void {
  let prevTasks = useTaskStore.getState().tasks
  let prevDistractions = useTaskStore.getState().distractions

  unsubscribeTasks = useTaskStore.subscribe((state) => {
    const changedTaskDates = getChangedDates(prevTasks, state.tasks)
    const changedDistractionDates = getChangedDates(prevDistractions, state.distractions)
    prevTasks = state.tasks
    prevDistractions = state.distractions

    const allChanged = new Set([...changedTaskDates, ...changedDistractionDates])
    for (const date of allChanged) {
      debouncedWrite(date)
    }
  })

  let prevPomodoros = usePomodoroStore.getState().completedPomodoros

  unsubscribePomodoro = usePomodoroStore.subscribe((state) => {
    const changed = getChangedDates(
      prevPomodoros as unknown as Record<string, unknown[]>,
      state.completedPomodoros as unknown as Record<string, unknown[]>
    )
    prevPomodoros = state.completedPomodoros

    for (const date of changed) {
      debouncedWrite(date)
    }
  })
}

// --- Public API ---

export async function initSync(): Promise<void> {
  const result = await window.bloc?.icloud.checkAvailability()
  if (!result?.available) {
    console.log('[sync] iCloud Drive not available')
    return
  }

  icloudAvailable = true
  console.log('[sync] iCloud Drive available at', result.path)

  const hasMigrated = localStorage.getItem(SYNC_MIGRATED_KEY) === 'true'

  if (!hasMigrated) {
    console.log('[sync] Migrating localStorage to iCloud...')
    await migrateLocalStorageToICloud()
    console.log('[sync] Migration complete')
  } else {
    console.log('[sync] Loading data from iCloud...')
    await loadAllFromICloud()
    console.log('[sync] Load complete')
  }

  // Listen for external file changes from main process
  cleanupFileChanged = window.bloc?.icloud.onFileChanged((data: DayFileData) => {
    console.log('[sync] External change detected for', data.date)
    applyExternalChange(data)
  }) ?? null

  subscribeToStoreChanges()
}

export async function loadDayFromICloud(date: string): Promise<void> {
  if (!icloudAvailable) return
  const data = await window.bloc?.icloud.readDay(date)
  if (data) {
    applyExternalChange(data)
  }
}

export async function watchDate(date: string): Promise<void> {
  if (!icloudAvailable) return
  // Watch current date plus today
  const today = new Date().toISOString().slice(0, 10)
  const dates = date === today ? [date] : [date, today]
  await window.bloc?.icloud.watchDates(dates)
}

export function cleanup(): void {
  unsubscribeTasks?.()
  unsubscribePomodoro?.()
  cleanupFileChanged?.()
  unsubscribeTasks = null
  unsubscribePomodoro = null
  cleanupFileChanged = null
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer)
  }
  debounceTimers.clear()
  window.bloc?.icloud.stopWatching()
}
