import { create } from 'zustand'
import { format } from 'date-fns'
import { useTaskStore } from './taskStore'
import { useTimeBlockStore } from './timeBlockStore'
import { usePomodoroStore } from './pomodoroStore'
import { getEffectiveEstimate } from '../utils/taskEstimates'

export interface FlowQueueItem {
  taskId: string
  blockKey: string // e.g. "2026-03-21__block__uuid"
  blockId: string
  estimatedMinutes: number | null // null = open-ended
  timeSpentSeconds: number
  status: 'pending' | 'active' | 'completed' | 'skipped'
}

export type FlowPhase = 'working' | 'break'

interface OriginalBlock {
  id: string
  startTime: number
  endTime: number
}

interface FlowState {
  isActive: boolean
  started: boolean // false = summary screen, true = timer running
  date: string | null
  blockId: string | null // The block being flowed
  queue: FlowQueueItem[]
  currentIndex: number
  originalBlocks: OriginalBlock[]
  isPaused: boolean
  autoPaused: boolean

  // Pomodoro-style timer
  phase: FlowPhase
  secondsRemaining: number
  totalSeconds: number
  startedAt: number | null
  expectedEndAt: number | null
  completedPomodoros: number

  // Task elapsed tracking (independent of pomodoro timer)
  taskTimerStartedAt: number | null
  taskAccumulatedSeconds: number
  lastCascadedMinutes: number

  activate: (date: string, blockId?: string) => void
  start: () => void
  stop: () => void
  deactivate: () => void
  tick: () => void
  completeCurrentTask: () => void
  skipCurrentTask: () => void
  pause: () => void
  resume: () => void
  autoPause: () => void
  autoResume: () => void
  getCurrentItem: () => FlowQueueItem | null
  getTaskElapsedSeconds: () => number
  getSecondsRemaining: () => number
}

function buildQueue(date: string): FlowQueueItem[] {
  const taskStore = useTaskStore.getState()
  const blocks = useTimeBlockStore.getState().blocks[date] || []
  const sorted = [...blocks].sort((a, b) => a.startTime - b.startTime)
  const queue: FlowQueueItem[] = []

  for (const block of sorted) {
    const blockKey = `${date}__block__${block.id}`
    const tasks = taskStore.tasks[blockKey] || []

    for (const task of tasks) {
      if (task.completed) continue
      const estimate = getEffectiveEstimate(task)
      queue.push({
        taskId: task.id,
        blockKey,
        blockId: block.id,
        estimatedMinutes: estimate ?? null,
        timeSpentSeconds: 0,
        status: 'pending'
      })
    }
  }

  return queue
}

function getWorkSeconds(): number {
  return usePomodoroStore.getState().workDuration * 60
}

function getBreakSeconds(): number {
  return usePomodoroStore.getState().breakDuration * 60
}

const IDLE_STATE = {
  isActive: false,
  started: false,
  date: null,
  blockId: null,
  queue: [] as FlowQueueItem[],
  currentIndex: -1,
  originalBlocks: [] as OriginalBlock[],
  isPaused: false,
  autoPaused: false,
  phase: 'working' as FlowPhase,
  secondsRemaining: 0,
  totalSeconds: 0,
  startedAt: null,
  expectedEndAt: null,
  completedPomodoros: 0,
  taskTimerStartedAt: null,
  taskAccumulatedSeconds: 0,
  lastCascadedMinutes: 0
}

export const useFlowStore = create<FlowState>()((set, get) => ({
  ...IDLE_STATE,

  // Prepare flow: build queue from all blocks of the day, show summary
  activate: (date, _blockId) => {
    const pomodoroStore = usePomodoroStore.getState()
    if (pomodoroStore.status !== 'idle') {
      pomodoroStore.stop()
    }

    const blocks = useTimeBlockStore.getState().blocks[date] || []
    const snapshot = blocks.map((b) => ({ id: b.id, startTime: b.startTime, endTime: b.endTime }))

    const queue = buildQueue(date)
    if (queue.length === 0) return

    set({
      isActive: true,
      started: false,
      date,
      blockId: null,
      queue,
      currentIndex: -1,
      originalBlocks: snapshot,
      isPaused: false,
      phase: 'working',
      secondsRemaining: 0,
      totalSeconds: 0,
      startedAt: null,
      expectedEndAt: null,
      completedPomodoros: 0,
      taskTimerStartedAt: null,
      taskAccumulatedSeconds: 0
    })
  },

  // Actually start the flow timer
  start: () => {
    const { isActive, started, queue } = get()
    if (!isActive || started || queue.length === 0) return

    // Find the first pending task (may not be index 0 if some were already worked on)
    const nextIndex = queue.findIndex((q) => q.status === 'pending')
    if (nextIndex === -1) return

    const newQueue = [...queue]
    newQueue[nextIndex] = { ...newQueue[nextIndex], status: 'active' }

    const workSeconds = getWorkSeconds()
    const now = Date.now()
    // Restore accumulated time from previous session
    const accumulated = newQueue[nextIndex].timeSpentSeconds

    set({
      started: true,
      queue: newQueue,
      currentIndex: nextIndex,
      phase: 'working',
      secondsRemaining: workSeconds,
      totalSeconds: workSeconds,
      startedAt: now,
      expectedEndAt: now + workSeconds * 1000,
      taskTimerStartedAt: now,
      taskAccumulatedSeconds: accumulated
    })
  },

  stop: () => {
    const { isActive, started, currentIndex, queue } = get()
    if (!isActive || !started) return

    // Persist elapsed time on the active item
    const newQueue = [...queue]
    if (currentIndex >= 0 && currentIndex < newQueue.length) {
      const elapsed = get().getTaskElapsedSeconds()
      newQueue[currentIndex] = {
        ...newQueue[currentIndex],
        status: 'pending',
        timeSpentSeconds: elapsed
      }
    }

    set({
      started: false,
      isPaused: false,
      queue: newQueue,
      currentIndex: -1,
      phase: 'working',
      secondsRemaining: 0,
      totalSeconds: 0,
      startedAt: null,
      expectedEndAt: null,
      taskTimerStartedAt: null,
      taskAccumulatedSeconds: 0,
      lastCascadedMinutes: 0
    })
  },

  deactivate: () => {
    set(IDLE_STATE)
  },

  tick: () => {
    const { isActive, started, isPaused, expectedEndAt, phase, currentIndex, queue, date } = get()
    if (!isActive || !started || isPaused || !expectedEndAt) return

    const remaining = Math.max(0, Math.round((expectedEndAt - Date.now()) / 1000))

    if (remaining > 0) {
      set({ secondsRemaining: remaining })

      // Check cascade for task overflow (only during working phase)
      if (phase === 'working' && currentIndex >= 0 && currentIndex < queue.length) {
        const item = queue[currentIndex]
        if (item && item.status === 'active' && item.estimatedMinutes !== null) {
          const taskElapsed = get().getTaskElapsedSeconds()
          const overflowSeconds = taskElapsed - item.estimatedMinutes * 60
          if (overflowSeconds > 0) {
            const overflowMinutes = Math.ceil(overflowSeconds / 60)
            if (overflowMinutes > get().lastCascadedMinutes) {
              cascadeBlocks(date!, item.blockId, overflowSeconds)
              set({ lastCascadedMinutes: overflowMinutes })
            }
          }
        }
      }
    } else {
      // Timer expired
      if (phase === 'working') {
        // Work done → start break
        const breakSeconds = getBreakSeconds()
        const now = Date.now()
        // Record completed pomodoro in stats
        const today = format(new Date(), 'yyyy-MM-dd')
        const pomoStore = usePomodoroStore.getState()
        const current = pomoStore.completedPomodoros[today] || 0
        usePomodoroStore.setState({
          completedPomodoros: { ...pomoStore.completedPomodoros, [today]: current + 1 }
        })
        set({
          phase: 'break',
          secondsRemaining: breakSeconds,
          totalSeconds: breakSeconds,
          startedAt: now,
          expectedEndAt: now + breakSeconds * 1000,
          completedPomodoros: get().completedPomodoros + 1,
          taskAccumulatedSeconds: get().getTaskElapsedSeconds(),
          taskTimerStartedAt: null
        })
      } else {
        // Break done → resume working
        const workSeconds = getWorkSeconds()
        const now = Date.now()
        set({
          phase: 'working',
          secondsRemaining: workSeconds,
          totalSeconds: workSeconds,
          startedAt: now,
          expectedEndAt: now + workSeconds * 1000,
          taskTimerStartedAt: now
        })
      }
    }
  },

  completeCurrentTask: () => {
    const { isActive, started, currentIndex, queue, date, phase } = get()
    if (!isActive || !started || currentIndex < 0 || currentIndex >= queue.length || !date) return

    const taskElapsed = get().getTaskElapsedSeconds()
    const newQueue = [...queue]
    newQueue[currentIndex] = {
      ...newQueue[currentIndex],
      status: 'completed',
      timeSpentSeconds: taskElapsed
    }

    const currentBlockId = newQueue[currentIndex].blockId
    const blockTasksRemaining = newQueue.filter(
      (q, i) => i > currentIndex && q.blockId === currentBlockId && q.status === 'pending'
    )

    if (blockTasksRemaining.length === 0) {
      shrinkBlockIfEarly(date, currentBlockId, newQueue)
    }

    const nextIndex = newQueue.findIndex((q, i) => i > currentIndex && q.status === 'pending')

    if (nextIndex === -1) {
      set({ ...IDLE_STATE, queue: newQueue })
      return
    }

    newQueue[nextIndex] = { ...newQueue[nextIndex], status: 'active' }

    const now = Date.now()
    set({
      queue: newQueue,
      currentIndex: nextIndex,
      taskTimerStartedAt: phase === 'working' ? now : null,
      taskAccumulatedSeconds: 0,
      lastCascadedMinutes: 0
    })
  },

  skipCurrentTask: () => {
    const { isActive, started, currentIndex, queue, date, phase } = get()
    if (!isActive || !started || currentIndex < 0 || currentIndex >= queue.length || !date) return

    const taskElapsed = get().getTaskElapsedSeconds()
    const newQueue = [...queue]

    const skippedItem = {
      ...newQueue[currentIndex],
      status: 'skipped' as const,
      timeSpentSeconds: taskElapsed
    }

    newQueue.splice(currentIndex, 1)

    const blockId = skippedItem.blockId
    let insertIndex = newQueue.length
    for (let i = currentIndex; i < newQueue.length; i++) {
      if (newQueue[i].blockId !== blockId) {
        insertIndex = i
        break
      }
    }

    newQueue.splice(insertIndex, 0, {
      ...skippedItem,
      status: 'pending',
      timeSpentSeconds: taskElapsed
    })

    const nextIndex = newQueue.findIndex((q) => q.status === 'pending')

    if (nextIndex === -1) {
      set({ ...IDLE_STATE, queue: newQueue })
      return
    }

    newQueue[nextIndex] = { ...newQueue[nextIndex], status: 'active' }

    const now = Date.now()
    set({
      queue: newQueue,
      currentIndex: nextIndex,
      taskTimerStartedAt: phase === 'working' ? now : null,
      taskAccumulatedSeconds: 0,
      lastCascadedMinutes: 0
    })
  },

  pause: () => {
    const { isActive, started, isPaused, expectedEndAt } = get()
    if (!isActive || !started || isPaused || !expectedEndAt) return

    const remaining = Math.max(0, Math.round((expectedEndAt - Date.now()) / 1000))
    const taskElapsed = get().getTaskElapsedSeconds()

    set({
      isPaused: true,
      autoPaused: false,
      secondsRemaining: remaining,
      expectedEndAt: null,
      startedAt: null,
      taskAccumulatedSeconds: taskElapsed,
      taskTimerStartedAt: null
    })
  },

  resume: () => {
    const { isActive, isPaused, secondsRemaining, phase } = get()
    if (!isActive || !isPaused) return

    const now = Date.now()
    set({
      isPaused: false,
      autoPaused: false,
      startedAt: now,
      expectedEndAt: now + secondsRemaining * 1000,
      taskTimerStartedAt: phase === 'working' ? now : null
    })
  },

  autoPause: () => {
    const { isActive, started, isPaused, expectedEndAt } = get()
    if (!isActive || !started || isPaused || !expectedEndAt) return

    const remaining = Math.max(0, Math.round((expectedEndAt - Date.now()) / 1000))
    const taskElapsed = get().getTaskElapsedSeconds()

    set({
      isPaused: true,
      autoPaused: true,
      secondsRemaining: remaining,
      expectedEndAt: null,
      startedAt: null,
      taskAccumulatedSeconds: taskElapsed,
      taskTimerStartedAt: null
    })
  },

  autoResume: () => {
    if (!get().autoPaused) return
    const { isActive, isPaused, secondsRemaining, phase } = get()
    if (!isActive || !isPaused) return

    const now = Date.now()
    set({
      isPaused: false,
      autoPaused: false,
      startedAt: now,
      expectedEndAt: now + secondsRemaining * 1000,
      taskTimerStartedAt: phase === 'working' ? now : null
    })
  },

  getCurrentItem: () => {
    const { isActive, started, currentIndex, queue } = get()
    if (!isActive || !started || currentIndex < 0 || currentIndex >= queue.length) return null
    return queue[currentIndex]
  },

  getTaskElapsedSeconds: () => {
    const { taskTimerStartedAt, taskAccumulatedSeconds } = get()
    if (!taskTimerStartedAt) return taskAccumulatedSeconds
    return taskAccumulatedSeconds + Math.floor((Date.now() - taskTimerStartedAt) / 1000)
  },

  getSecondsRemaining: () => {
    const { expectedEndAt, secondsRemaining, isPaused } = get()
    if (isPaused || !expectedEndAt) return secondsRemaining
    return Math.max(0, Math.round((expectedEndAt - Date.now()) / 1000))
  }
}))

// Cascade: push subsequent blocks forward when a task overflows.
// Uses originalBlocks to compute the delta from the un-extended endTime,
// avoiding double-counting when called repeatedly with cumulative overflowSeconds.
function cascadeBlocks(date: string, overflowBlockId: string, overflowSeconds: number): void {
  const blockStore = useTimeBlockStore.getState()
  const blocks = blockStore.blocks[date] || []
  const sorted = [...blocks].sort((a, b) => a.startTime - b.startTime)

  const overflowMinutes = Math.ceil(overflowSeconds / 60)
  if (overflowMinutes <= 0) return

  const blockIndex = sorted.findIndex((b) => b.id === overflowBlockId)
  if (blockIndex === -1) return

  // Use the original (pre-flow) endTime to avoid double-counting
  const original = useFlowStore.getState().originalBlocks.find((b) => b.id === overflowBlockId)
  const originalEndTime = original ? original.endTime : sorted[blockIndex].endTime
  const newEndTime = originalEndTime + overflowMinutes

  const currentBlock = sorted[blockIndex]
  const shift = newEndTime - currentBlock.endTime
  if (shift <= 0) return

  blockStore.updateBlock(date, overflowBlockId, { endTime: newEndTime })

  for (let i = blockIndex + 1; i < sorted.length; i++) {
    const block = sorted[i]
    if (block.isGoogleReadOnly) continue
    blockStore.updateBlock(date, block.id, {
      startTime: block.startTime + shift,
      endTime: block.endTime + shift
    })
  }
}

function shrinkBlockIfEarly(date: string, blockId: string, queue: FlowQueueItem[]): void {
  const blockStore = useTimeBlockStore.getState()
  const blocks = blockStore.blocks[date] || []
  const block = blocks.find((b) => b.id === blockId)
  if (!block) return

  const blockTasks = queue.filter((q) => q.blockId === blockId)
  const totalSeconds = blockTasks.reduce((sum, q) => sum + q.timeSpentSeconds, 0)
  const totalMinutes = Math.ceil(totalSeconds / 60)

  const actualEndTime = block.startTime + Math.max(totalMinutes, 5)

  if (actualEndTime >= block.endTime) return

  const savedMinutes = block.endTime - actualEndTime
  blockStore.updateBlock(date, blockId, { endTime: actualEndTime })

  const sorted = [...blocks].sort((a, b) => a.startTime - b.startTime)
  const blockIndex = sorted.findIndex((b) => b.id === blockId)

  for (let i = blockIndex + 1; i < sorted.length; i++) {
    const b = sorted[i]
    if (b.isGoogleReadOnly) continue
    blockStore.updateBlock(date, b.id, {
      startTime: b.startTime - savedMinutes,
      endTime: b.endTime - savedMinutes
    })
  }
}

// Subscribe to task completions to auto-advance flow
useTaskStore.subscribe((state, prevState) => {
  const flowState = useFlowStore.getState()
  if (!flowState.isActive || !flowState.started || flowState.currentIndex < 0) return

  const currentItem = flowState.queue[flowState.currentIndex]
  if (!currentItem || currentItem.status !== 'active') return

  const blockKey = currentItem.blockKey
  const currentTasks = state.tasks[blockKey] || []
  const prevTasks = prevState.tasks[blockKey] || []

  const task = currentTasks.find((t) => t.id === currentItem.taskId)
  const prevTask = prevTasks.find((t) => t.id === currentItem.taskId)

  if (task?.completed && !prevTask?.completed) {
    flowState.completeCurrentTask()
  }
})

// Sync queue when tasks are deleted — remove orphaned queue items
useTaskStore.subscribe((state, prevState) => {
  const flowState = useFlowStore.getState()
  if (!flowState.isActive || !flowState.started) return

  const { queue, currentIndex } = flowState
  let changed = false
  const newQueue = queue.filter((item) => {
    const tasks = state.tasks[item.blockKey] || []
    const exists = tasks.some((t) => t.id === item.taskId)
    if (!exists && item.status !== 'completed') {
      changed = true
      return false
    }
    return true
  })

  if (!changed) return

  // Recalculate currentIndex
  const currentItem = queue[currentIndex]
  let newIndex = currentItem
    ? newQueue.findIndex(
        (q) => q.taskId === currentItem.taskId && q.blockKey === currentItem.blockKey
      )
    : -1

  // If current task was deleted, find next pending
  if (newIndex === -1) {
    newIndex = newQueue.findIndex((q) => q.status === 'pending')
    if (newIndex >= 0) {
      newQueue[newIndex] = { ...newQueue[newIndex], status: 'active' }
    }
  }

  if (newQueue.length === 0) {
    useFlowStore.setState(IDLE_STATE)
  } else {
    useFlowStore.setState({ queue: newQueue, currentIndex: newIndex >= 0 ? newIndex : 0 })
  }
})

// Guard: prevent pomodoro start when flow is active
usePomodoroStore.subscribe((state, prevState) => {
  const flowState = useFlowStore.getState()
  if (!flowState.isActive) return

  if (state.status !== 'idle' && prevState.status === 'idle') {
    flowState.deactivate()
  }
})
