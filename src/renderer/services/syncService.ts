import { useTaskStore } from '../stores/taskStore'
import { usePomodoroStore } from '../stores/pomodoroStore'
import { useTimeBlockStore, type TimeBlock } from '../stores/timeBlockStore'
import type { Task, TaskRef, Distraction } from '../stores/taskStore'

interface TaskData {
  id: string
  text: string
  completed: boolean
  completedAt?: number
  createdAt: number
  subtasks: TaskData[]
  references?: Array<{ date: string; taskId: string }>
}

interface TaskRefData {
  id: string
  originDate: string
  originTaskId: string
  addedAt: number
}

interface DistractionData {
  id: string
  text: string
  createdAt: number
  status: 'pending' | 'dismissed' | 'converted'
  processedAt?: number
}

interface TimeBlockData {
  id: string
  startTime: number
  endTime: number
  title: string
  color: string
  createdAt: number
  updatedAt: number
  googleEventId?: string
  isGoogleReadOnly?: boolean
}

interface DayFileData {
  date: string
  pomodoros: number
  updatedAt: number
  tasks: TaskData[]
  distractions: DistractionData[]
  timeBlocks?: TimeBlockData[]
  references?: TaskRefData[]
  blockTasks?: Record<string, TaskData[]>
}

const SYNC_MIGRATED_KEY = 'bloc-icloud-migrated'
let unsubscribeTasks: (() => void) | null = null
let unsubscribePomodoro: (() => void) | null = null
let unsubscribeTimeBlocks: (() => void) | null = null
let cleanupFileChanged: (() => void) | null = null
let debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
let icloudAvailable = false
let applyingExternal = false // suppress write-back while applying external changes

// --- Conversion helpers ---

function taskToData(task: Task): TaskData {
  return {
    id: task.id,
    text: task.text,
    completed: task.completed,
    completedAt: task.completedAt,
    estimatedMinutes: task.estimatedMinutes,
    createdAt: task.createdAt,
    subtasks: task.subtasks.map(taskToData),
    references: task.references
  }
}

function dataToTask(data: TaskData, date: string): Task {
  return {
    id: data.id,
    text: data.text,
    completed: data.completed,
    completedAt: data.completedAt,
    estimatedMinutes: data.estimatedMinutes,
    createdAt: data.createdAt,
    date,
    subtasks: data.subtasks.map((st) => dataToTask(st, date)),
    references: data.references
  }
}

function taskRefToData(ref: TaskRef): TaskRefData {
  return {
    id: ref.id,
    originDate: ref.originDate,
    originTaskId: ref.originTaskId,
    addedAt: ref.addedAt
  }
}

function dataToTaskRef(data: TaskRefData): TaskRef {
  return {
    id: data.id,
    originDate: data.originDate,
    originTaskId: data.originTaskId,
    addedAt: data.addedAt
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

function timeBlockToData(b: TimeBlock): TimeBlockData {
  return {
    id: b.id,
    startTime: b.startTime,
    endTime: b.endTime,
    title: b.title,
    color: b.color,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    googleEventId: b.googleEventId,
    isGoogleReadOnly: b.isGoogleReadOnly
  }
}

function dataToTimeBlock(data: TimeBlockData, date: string): TimeBlock {
  return {
    id: data.id,
    date,
    startTime: data.startTime,
    endTime: data.endTime,
    title: data.title,
    color: data.color as TimeBlock['color'],
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    googleEventId: data.googleEventId,
    isGoogleReadOnly: data.isGoogleReadOnly
  }
}

// --- Core sync functions ---

function collectBlockTasks(date: string): Record<string, TaskData[]> {
  const allTasks = useTaskStore.getState().tasks
  const prefix = `${date}__block__`
  const blockTasks: Record<string, TaskData[]> = {}

  for (const key of Object.keys(allTasks)) {
    if (key.startsWith(prefix)) {
      const blockId = key.slice(prefix.length)
      blockTasks[blockId] = allTasks[key].map(taskToData)
    }
  }

  return blockTasks
}

function buildDayFileData(date: string): DayFileData {
  const tasks = useTaskStore.getState().tasks[date] || []
  const distractions = useTaskStore.getState().distractions[date] || []
  const taskRefs = useTaskStore.getState().taskRefs[date] || []
  const pomodoros = usePomodoroStore.getState().completedPomodoros[date] || 0
  const timeBlocks = useTimeBlockStore.getState().blocks[date] || []
  const blockTasks = collectBlockTasks(date)

  return {
    date,
    pomodoros,
    updatedAt: Date.now(),
    tasks: tasks.map(taskToData),
    distractions: distractions.map(distractionToData),
    timeBlocks: timeBlocks.map(timeBlockToData),
    references: taskRefs.map(taskRefToData),
    blockTasks: Object.keys(blockTasks).length > 0 ? blockTasks : undefined
  }
}

function writeDayToICloud(date: string): void {
  if (!icloudAvailable) return
  const data = buildDayFileData(date)
  window.bloc?.icloud.writeDay(data)
}

function debouncedWrite(date: string): void {
  if (applyingExternal) return // don't write back while applying external changes
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
  applyingExternal = true
  try {
    const taskState = useTaskStore.getState()
    const pomodoroState = usePomodoroStore.getState()
    const timeBlockState = useTimeBlockStore.getState()

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

    // Apply task references
    const newRefs = (data.references || []).map(dataToTaskRef)
    useTaskStore.setState({
      taskRefs: { ...taskState.taskRefs, [data.date]: newRefs }
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

    // Apply time blocks (including empty array when all blocks deleted)
    const newTimeBlocks = (data.timeBlocks || []).map((b) => dataToTimeBlock(b, data.date))
    useTimeBlockStore.setState({
      blocks: { ...timeBlockState.blocks, [data.date]: newTimeBlocks }
    })

    // Apply block tasks — also clean up orphaned block task keys
    const currentTasks = useTaskStore.getState().tasks
    const updatedTasks = { ...currentTasks }

    // Remove existing block task keys for this date
    const blockPrefix = `${data.date}__block__`
    for (const key of Object.keys(updatedTasks)) {
      if (key.startsWith(blockPrefix)) {
        delete updatedTasks[key]
      }
    }

    // Add block tasks from external data
    if (data.blockTasks) {
      for (const [blockId, tasks] of Object.entries(data.blockTasks)) {
        const key = `${data.date}__block__${blockId}`
        updatedTasks[key] = tasks.map((t) => dataToTask(t, data.date))
      }
    }
    useTaskStore.setState({ tasks: updatedTasks })
  } finally {
    applyingExternal = false
  }
}

// --- Migration ---

async function migrateLocalStorageToICloud(): Promise<void> {
  const taskState = useTaskStore.getState()
  const pomodoroState = usePomodoroStore.getState()

  const allDates = new Set<string>()
  for (const date of Object.keys(taskState.tasks)) allDates.add(date)
  for (const date of Object.keys(taskState.distractions)) allDates.add(date)
  for (const date of Object.keys(taskState.taskRefs)) allDates.add(date)
  for (const date of Object.keys(pomodoroState.completedPomodoros)) allDates.add(date)

  for (const date of allDates) {
    if (date.includes('__block__') || date === '__backlog__') continue // per-block and backlog task keys are handled via their parent date
    writeDayToICloud(date)
  }

  localStorage.setItem(SYNC_MIGRATED_KEY, 'true')
}

async function loadAllFromICloud(): Promise<void> {
  const allDays: DayFileData[] | undefined = await window.bloc?.icloud.readAllDays()
  if (!allDays) return

  const newTasks: Record<string, Task[]> = {}
  const newDistractions: Record<string, Distraction[]> = {}
  const newTaskRefs: Record<string, TaskRef[]> = {}
  const newPomodoros: Record<string, number> = {}
  const newTimeBlocks: Record<string, TimeBlock[]> = {}

  for (const day of allDays) {
    if (day.tasks.length > 0) {
      newTasks[day.date] = day.tasks.map((t) => dataToTask(t, day.date))
    }
    if (day.distractions.length > 0) {
      newDistractions[day.date] = day.distractions.map((d) => dataToDistraction(d, day.date))
    }
    if (day.references && day.references.length > 0) {
      newTaskRefs[day.date] = day.references.map(dataToTaskRef)
    }
    if (day.pomodoros > 0) {
      newPomodoros[day.date] = day.pomodoros
    }
    if (day.timeBlocks && day.timeBlocks.length > 0) {
      newTimeBlocks[day.date] = day.timeBlocks.map((b) => dataToTimeBlock(b, day.date))
    }
    if (day.blockTasks) {
      for (const [blockId, tasks] of Object.entries(day.blockTasks)) {
        const key = `${day.date}__block__${blockId}`
        newTasks[key] = tasks.map((t) => dataToTask(t, day.date))
      }
    }
  }

  // Merge with existing local data — iCloud takes precedence
  const taskState = useTaskStore.getState()
  const pomodoroState = usePomodoroStore.getState()
  const timeBlockState = useTimeBlockStore.getState()

  useTaskStore.setState({
    tasks: { ...taskState.tasks, ...newTasks },
    distractions: { ...taskState.distractions, ...newDistractions },
    taskRefs: { ...taskState.taskRefs, ...newTaskRefs }
  })

  usePomodoroStore.setState({
    completedPomodoros: { ...pomodoroState.completedPomodoros, ...newPomodoros }
  })

  useTimeBlockStore.setState({
    blocks: { ...timeBlockState.blocks, ...newTimeBlocks }
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
  let prevTaskRefs = useTaskStore.getState().taskRefs

  unsubscribeTasks = useTaskStore.subscribe((state) => {
    const changedTaskDates = getChangedDates(prevTasks, state.tasks)
    const changedDistractionDates = getChangedDates(prevDistractions, state.distractions)
    const changedRefDates = getChangedDates(
      prevTaskRefs as unknown as Record<string, unknown[]>,
      state.taskRefs as unknown as Record<string, unknown[]>
    )
    prevTasks = state.tasks
    prevDistractions = state.distractions
    prevTaskRefs = state.taskRefs

    const allChanged = new Set([...changedTaskDates, ...changedDistractionDates, ...changedRefDates])
    for (const date of allChanged) {
      if (date === '__backlog__') continue // backlog task keys are local-only
      if (date.includes('__block__')) {
        // Block task key changed — trigger write for the parent date
        const parentDate = date.split('__block__')[0]
        debouncedWrite(parentDate)
        continue
      }
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

  let prevBlocks = useTimeBlockStore.getState().blocks

  unsubscribeTimeBlocks = useTimeBlockStore.subscribe((state) => {
    const changed = getChangedDates(
      prevBlocks as unknown as Record<string, unknown[]>,
      state.blocks as unknown as Record<string, unknown[]>
    )
    prevBlocks = state.blocks

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
  // Flush any pending debounced write so we don't overwrite recent local changes
  // with stale disk data
  const pending = debounceTimers.get(date)
  if (pending) {
    clearTimeout(pending)
    debounceTimers.delete(date)
    writeDayToICloud(date)
  }
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
  unsubscribeTimeBlocks?.()
  cleanupFileChanged?.()
  unsubscribeTasks = null
  unsubscribePomodoro = null
  unsubscribeTimeBlocks = null
  cleanupFileChanged = null
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer)
  }
  debounceTimers.clear()
  window.bloc?.icloud.stopWatching()
}
