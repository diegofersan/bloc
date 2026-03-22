import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useClipboardStore } from './clipboardStore'

export const BACKLOG_KEY = '__backlog__'

export interface Task {
  id: string
  text: string
  completed: boolean
  completedAt?: number
  completedFromDate?: string
  subtasks: Task[]
  date: string
  createdAt: number
  isExpanding?: boolean
  estimatedMinutes?: number
  references?: Array<{ date: string; taskId: string }>
}

export interface TaskRef {
  id: string
  originDate: string      // date key onde a tarefa original vive
  originTaskId: string    // UUID da tarefa original
  addedAt: number         // timestamp quando a referência foi criada
}

export type DistractionStatus = 'pending' | 'dismissed' | 'converted'

export interface Distraction {
  id: string
  text: string
  createdAt: number
  sourceDate: string
  status: DistractionStatus
  processedAt?: number
  convertedToDate?: string
  convertedToTaskId?: string
}

interface DeletedTask {
  task: Task
  date: string
  index: number
  movedTo?: string
  movedTaskId?: string
}

interface TaskState {
  tasks: Record<string, Task[]>
  taskRefs: Record<string, TaskRef[]>
  distractions: Record<string, Distraction[]>
  lastDeleted: DeletedTask | null
  addTask: (date: string, text: string) => void
  toggleTask: (date: string, taskId: string) => void
  removeTask: (date: string, taskId: string) => void
  undoDelete: () => void
  addSubtasks: (date: string, taskId: string, subtaskTexts: string[]) => void
  addManualSubtask: (date: string, parentTaskId: string, text?: string) => string
  indentTaskAsSubtask: (date: string, taskId: string) => boolean
  addSubtaskToSubtask: (date: string, taskId: string, subtaskId: string, subtaskTexts: string[]) => void
  setTaskExpanding: (date: string, taskId: string, expanding: boolean) => void
  updateTaskText: (date: string, taskId: string, text: string) => void
  insertTaskAfter: (date: string, afterTaskId: string, text: string) => string
  insertSubtaskAfter: (date: string, parentId: string, afterSubtaskId: string, text: string) => string
  removeSubtask: (date: string, parentId: string, subtaskId: string) => void
  getTasksForDate: (date: string) => Task[]
  moveTask: (fromKey: string, toKey: string, taskId: string) => void
  copyTask: (fromKey: string, toKey: string, task: Task) => void
  getDatesWithTasks: () => string[]
  addDistraction: (date: string, text: string) => void
  updateDistractionText: (date: string, id: string, text: string) => void
  dismissDistraction: (date: string, id: string) => void
  convertToTask: (sourceDate: string, id: string, targetDate: string) => void
  removeDistraction: (date: string, id: string) => void
  getPendingDistractions: () => (Distraction & { _date: string })[]
  getPendingDistractionCount: () => number
  getDatesWithPendingDistractions: () => string[]
  cleanOldDistractions: (daysToKeep?: number) => void
  createTaskRef: (originDate: string, taskId: string, targetDate: string) => void
  toggleTaskRef: (refDate: string, refId: string) => void
  removeTaskRef: (refDate: string, refId: string) => void
  getResolvedTask: (ref: TaskRef) => Task | null
  unindentTask: (date: string, subtaskId: string) => boolean
  getPendingTasksAcrossDates: () => Array<{ task: Task; date: string }>
  updateTaskEstimate: (date: string, taskId: string, minutes: number | undefined) => void
  moveBlockTasks: (fromDate: string, blockId: string, toDate: string) => void
}

function toggleTaskInList(tasks: Task[], taskId: string): Task[] {
  return tasks.map((task) => {
    if (task.id === taskId) {
      const nowCompleted = !task.completed
      return {
        ...task,
        completed: nowCompleted,
        completedAt: nowCompleted ? Date.now() : undefined
      }
    }
    if (task.subtasks.length > 0) {
      return { ...task, subtasks: toggleTaskInList(task.subtasks, taskId) }
    }
    return task
  })
}

function removeTaskFromList(tasks: Task[], taskId: string): Task[] {
  return tasks
    .filter((task) => task.id !== taskId)
    .map((task) => ({
      ...task,
      subtasks: removeTaskFromList(task.subtasks, taskId)
    }))
}

function findTaskInList(tasks: Task[], taskId: string): Task | null {
  for (const task of tasks) {
    if (task.id === taskId) return task
    if (task.subtasks.length > 0) {
      const found = findTaskInList(task.subtasks, taskId)
      if (found) return found
    }
  }
  return null
}

function addSubtasksToTask(tasks: Task[], taskId: string, subtaskTexts: string[], date: string): Task[] {
  return tasks.map((task) => {
    if (task.id === taskId) {
      const newSubtasks: Task[] = subtaskTexts.map((text) => ({
        id: crypto.randomUUID(),
        text,
        completed: false,
        subtasks: [],
        date,
        createdAt: Date.now()
      }))
      return { ...task, subtasks: [...task.subtasks, ...newSubtasks] }
    }
    if (task.subtasks.length > 0) {
      return { ...task, subtasks: addSubtasksToTask(task.subtasks, taskId, subtaskTexts, date) }
    }
    return task
  })
}

function addSubtasksToSubtask(
  tasks: Task[],
  taskId: string,
  subtaskId: string,
  subtaskTexts: string[],
  date: string
): Task[] {
  return tasks.map((task) => {
    if (task.id === taskId) {
      return { ...task, subtasks: addSubtasksToTask(task.subtasks, subtaskId, subtaskTexts, date) }
    }
    if (task.subtasks.length > 0) {
      return { ...task, subtasks: addSubtasksToSubtask(task.subtasks, taskId, subtaskId, subtaskTexts, date) }
    }
    return task
  })
}

function updateTextInList(tasks: Task[], taskId: string, text: string): Task[] {
  return tasks.map((task) => {
    if (task.id === taskId) {
      return { ...task, text }
    }
    if (task.subtasks.length > 0) {
      return { ...task, subtasks: updateTextInList(task.subtasks, taskId, text) }
    }
    return task
  })
}

function setExpandingInList(tasks: Task[], taskId: string, expanding: boolean): Task[] {
  return tasks.map((task) => {
    if (task.id === taskId) {
      return { ...task, isExpanding: expanding }
    }
    if (task.subtasks.length > 0) {
      return { ...task, subtasks: setExpandingInList(task.subtasks, taskId, expanding) }
    }
    return task
  })
}

function insertSubtaskAfterInList(tasks: Task[], parentId: string, afterSubtaskId: string, newSubtask: Task): Task[] {
  return tasks.map((task) => {
    if (task.id === parentId) {
      const idx = task.subtasks.findIndex((s) => s.id === afterSubtaskId)
      const updated = [...task.subtasks]
      updated.splice(idx + 1, 0, newSubtask)
      return { ...task, subtasks: updated }
    }
    if (task.subtasks.length > 0) {
      return { ...task, subtasks: insertSubtaskAfterInList(task.subtasks, parentId, afterSubtaskId, newSubtask) }
    }
    return task
  })
}

function removeSubtaskFromParent(tasks: Task[], parentId: string, subtaskId: string): Task[] {
  return tasks.map((task) => {
    if (task.id === parentId) {
      return { ...task, subtasks: task.subtasks.filter((s) => s.id !== subtaskId) }
    }
    if (task.subtasks.length > 0) {
      return { ...task, subtasks: removeSubtaskFromParent(task.subtasks, parentId, subtaskId) }
    }
    return task
  })
}

function findParentChain(tasks: Task[], targetId: string, chain: string[] = []): { parentId: string; grandparentId: string | null } | null {
  for (const task of tasks) {
    for (const sub of task.subtasks) {
      if (sub.id === targetId) {
        return { parentId: task.id, grandparentId: chain.length > 0 ? chain[chain.length - 1] : null }
      }
    }
    if (task.subtasks.length > 0) {
      const found = findParentChain(task.subtasks, targetId, [...chain, task.id])
      if (found) return found
    }
  }
  return null
}

function updateTaskInList(tasks: Task[], taskId: string, updater: (task: Task) => Task): Task[] {
  return tasks.map((task) => {
    if (task.id === taskId) {
      return updater(task)
    }
    if (task.subtasks.length > 0) {
      return { ...task, subtasks: updateTaskInList(task.subtasks, taskId, updater) }
    }
    return task
  })
}

function cloneTaskWithNewIds(task: Task, newDate: string): Task {
  return {
    ...task,
    id: crypto.randomUUID(),
    date: newDate,
    createdAt: Date.now(),
    subtasks: task.subtasks.map((s) => cloneTaskWithNewIds(s, newDate))
  }
}

function updateTaskDate(task: Task, newDate: string): Task {
  return {
    ...task,
    date: newDate,
    subtasks: task.subtasks.map((s) => updateTaskDate(s, newDate))
  }
}

function cleanExpandingFromTasks(tasks: Task[]): Task[] {
  return tasks.map((task) => ({
    ...task,
    isExpanding: undefined,
    subtasks: task.subtasks.length > 0 ? cleanExpandingFromTasks(task.subtasks) : task.subtasks
  }))
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: {},
      taskRefs: {},
      distractions: {},
      lastDeleted: null,

      addTask: (date, text) => {
        const newTask: Task = {
          id: crypto.randomUUID(),
          text,
          completed: false,
          subtasks: [],
          date,
          createdAt: Date.now()
        }
        set((state) => ({
          tasks: {
            ...state.tasks,
            [date]: [...(state.tasks[date] || []), newTask]
          }
        }))
      },

      toggleTask: (date, taskId) => {
        set((state) => {
          const dateTasks = state.tasks[date]
          if (!dateTasks) return state
          return {
            tasks: {
              ...state.tasks,
              [date]: toggleTaskInList(dateTasks, taskId)
            }
          }
        })
      },

      removeTask: (date, taskId) => {
        set((state) => {
          const dateTasks = state.tasks[date]
          if (!dateTasks) return state
          const index = dateTasks.findIndex((t) => t.id === taskId)
          const task = index >= 0 ? dateTasks[index] : findTaskInList(dateTasks, taskId)
          const updated = removeTaskFromList(dateTasks, taskId)
          const newTasks = { ...state.tasks }
          if (updated.length === 0) {
            delete newTasks[date]
          } else {
            newTasks[date] = updated
          }
          // Clear clipboard if the removed task is in it
          const clipboard = useClipboardStore.getState()
          if (clipboard.taskId === taskId) {
            clipboard.clearClipboard()
          }
          return {
            tasks: newTasks,
            lastDeleted: task ? { task, date, index: Math.max(0, index) } : state.lastDeleted
          }
        })
      },

      moveTask: (fromKey, toKey, taskId) => {
        set((state) => {
          const fromTasks = state.tasks[fromKey]
          if (!fromTasks) return state
          const task = findTaskInList(fromTasks, taskId)
          if (!task) return state
          const index = fromTasks.findIndex((t) => t.id === taskId)
          const movedTask = updateTaskDate(task, toKey)
          const updatedFrom = removeTaskFromList(fromTasks, taskId)
          const newTasks = { ...state.tasks }
          if (updatedFrom.length === 0) {
            delete newTasks[fromKey]
          } else {
            newTasks[fromKey] = updatedFrom
          }
          newTasks[toKey] = [...(newTasks[toKey] || []), movedTask]
          return {
            tasks: newTasks,
            lastDeleted: { task, date: fromKey, index: Math.max(0, index), movedTo: toKey, movedTaskId: movedTask.id }
          }
        })
      },

      copyTask: (_fromKey, toKey, task) => {
        const cloned = cloneTaskWithNewIds(task, toKey)
        set((state) => ({
          tasks: {
            ...state.tasks,
            [toKey]: [...(state.tasks[toKey] || []), cloned]
          }
        }))
      },

      undoDelete: () => {
        const { lastDeleted } = get()
        if (!lastDeleted) return
        set((state) => {
          const newTasks = { ...state.tasks }
          // If this was a move, remove from destination
          if (lastDeleted.movedTo && lastDeleted.movedTaskId) {
            const destTasks = newTasks[lastDeleted.movedTo]
            if (destTasks) {
              const updated = destTasks.filter((t) => t.id !== lastDeleted.movedTaskId)
              if (updated.length === 0) {
                delete newTasks[lastDeleted.movedTo]
              } else {
                newTasks[lastDeleted.movedTo] = updated
              }
            }
          }
          // Restore to original position
          const dateTasks = [...(newTasks[lastDeleted.date] || [])]
          const idx = Math.min(lastDeleted.index, dateTasks.length)
          dateTasks.splice(idx, 0, lastDeleted.task)
          newTasks[lastDeleted.date] = dateTasks
          return { tasks: newTasks, lastDeleted: null }
        })
      },

      addSubtasks: (date, taskId, subtaskTexts) => {
        set((state) => {
          const dateTasks = state.tasks[date]
          if (!dateTasks) return state
          return {
            tasks: {
              ...state.tasks,
              [date]: addSubtasksToTask(dateTasks, taskId, subtaskTexts, date)
            }
          }
        })
      },

      addManualSubtask: (date, parentTaskId, text = '') => {
        const newId = crypto.randomUUID()
        set((state) => {
          const dateTasks = state.tasks[date]
          if (!dateTasks) return state
          const newSubtask: Task = {
            id: newId,
            text,
            completed: false,
            subtasks: [],
            date,
            createdAt: Date.now()
          }
          function appendSubtask(tasks: Task[]): Task[] {
            return tasks.map((task) => {
              if (task.id === parentTaskId) {
                return { ...task, subtasks: [...task.subtasks, newSubtask] }
              }
              if (task.subtasks.length > 0) {
                return { ...task, subtasks: appendSubtask(task.subtasks) }
              }
              return task
            })
          }
          return {
            tasks: {
              ...state.tasks,
              [date]: appendSubtask(dateTasks)
            }
          }
        })
        return newId
      },

      indentTaskAsSubtask: (date, taskId) => {
        const state = get()
        const dateTasks = state.tasks[date]
        if (!dateTasks) return false
        const index = dateTasks.findIndex((t) => t.id === taskId)
        if (index <= 0) return false // Can't indent first task or not found at root
        const taskToIndent = dateTasks[index]
        const parentTask = dateTasks[index - 1]
        const updatedTasks = dateTasks.filter((t) => t.id !== taskId)
        const updatedParent = {
          ...parentTask,
          subtasks: [...parentTask.subtasks, { ...taskToIndent, subtasks: taskToIndent.subtasks }]
        }
        set({
          tasks: {
            ...state.tasks,
            [date]: updatedTasks.map((t) => (t.id === parentTask.id ? updatedParent : t))
          }
        })
        return true
      },

      addSubtaskToSubtask: (date, taskId, subtaskId, subtaskTexts) => {
        set((state) => {
          const dateTasks = state.tasks[date]
          if (!dateTasks) return state
          return {
            tasks: {
              ...state.tasks,
              [date]: addSubtasksToSubtask(dateTasks, taskId, subtaskId, subtaskTexts, date)
            }
          }
        })
      },

      setTaskExpanding: (date, taskId, expanding) => {
        set((state) => {
          const dateTasks = state.tasks[date]
          if (!dateTasks) return state
          return {
            tasks: {
              ...state.tasks,
              [date]: setExpandingInList(dateTasks, taskId, expanding)
            }
          }
        })
      },

      updateTaskText: (date, taskId, text) => {
        set((state) => {
          const dateTasks = state.tasks[date]
          if (!dateTasks) return state
          return {
            tasks: {
              ...state.tasks,
              [date]: updateTextInList(dateTasks, taskId, text)
            }
          }
        })
      },

      insertTaskAfter: (date, afterTaskId, text) => {
        const newId = crypto.randomUUID()
        const newTask: Task = {
          id: newId,
          text,
          completed: false,
          subtasks: [],
          date,
          createdAt: Date.now()
        }
        set((state) => {
          const dateTasks = state.tasks[date] || []
          const index = dateTasks.findIndex((t) => t.id === afterTaskId)
          const updated = [...dateTasks]
          updated.splice(index + 1, 0, newTask)
          return {
            tasks: {
              ...state.tasks,
              [date]: updated
            }
          }
        })
        return newId
      },

      insertSubtaskAfter: (date, parentId, afterSubtaskId, text) => {
        const newId = crypto.randomUUID()
        const newSubtask: Task = {
          id: newId,
          text,
          completed: false,
          subtasks: [],
          date,
          createdAt: Date.now()
        }
        set((state) => {
          const dateTasks = state.tasks[date]
          if (!dateTasks) return state
          return {
            tasks: {
              ...state.tasks,
              [date]: insertSubtaskAfterInList(dateTasks, parentId, afterSubtaskId, newSubtask)
            }
          }
        })
        return newId
      },

      removeSubtask: (date, parentId, subtaskId) => {
        set((state) => {
          const dateTasks = state.tasks[date]
          if (!dateTasks) return state
          return {
            tasks: {
              ...state.tasks,
              [date]: removeSubtaskFromParent(dateTasks, parentId, subtaskId)
            }
          }
        })
      },

      unindentTask: (date, subtaskId) => {
        const state = get()
        const dateTasks = state.tasks[date]
        if (!dateTasks) return false

        const result = findParentChain(dateTasks, subtaskId)
        if (!result) return false

        const { parentId, grandparentId } = result
        const subtask = findTaskInList(dateTasks, subtaskId)
        if (!subtask) return false

        let updated = removeSubtaskFromParent(dateTasks, parentId, subtaskId)

        if (grandparentId === null) {
          const parentIndex = updated.findIndex((t) => t.id === parentId)
          if (parentIndex === -1) return false
          updated = [...updated]
          updated.splice(parentIndex + 1, 0, subtask)
        } else {
          updated = insertSubtaskAfterInList(updated, grandparentId, parentId, subtask)
        }

        set({ tasks: { ...state.tasks, [date]: updated } })
        return true
      },

      getTasksForDate: (date) => {
        return get().tasks[date] || []
      },

      getDatesWithTasks: () => {
        return Object.keys(get().tasks).filter((date) => date !== BACKLOG_KEY && get().tasks[date].length > 0)
      },

      addDistraction: (date, text) => {
        const distraction: Distraction = {
          id: crypto.randomUUID(),
          text,
          createdAt: Date.now(),
          sourceDate: date,
          status: 'pending'
        }
        set((state) => ({
          distractions: {
            ...state.distractions,
            [date]: [...(state.distractions[date] || []), distraction]
          }
        }))
      },

      updateDistractionText: (date, id, text) => {
        set((state) => {
          const list = state.distractions[date]
          if (!list) return state
          return {
            distractions: {
              ...state.distractions,
              [date]: list.map((d) => (d.id === id ? { ...d, text } : d))
            }
          }
        })
      },

      dismissDistraction: (date, id) => {
        set((state) => {
          const list = state.distractions[date]
          if (!list) return state
          return {
            distractions: {
              ...state.distractions,
              [date]: list.map((d) =>
                d.id === id ? { ...d, status: 'dismissed' as const, processedAt: Date.now() } : d
              )
            }
          }
        })
      },

      convertToTask: (sourceDate, id, targetDate) => {
        const state = get()
        const list = state.distractions[sourceDate]
        if (!list) return
        const distraction = list.find((d) => d.id === id)
        if (!distraction) return

        const newTaskId = crypto.randomUUID()
        const newTask: Task = {
          id: newTaskId,
          text: distraction.text,
          completed: false,
          subtasks: [],
          date: targetDate,
          createdAt: Date.now()
        }

        set((s) => ({
          tasks: {
            ...s.tasks,
            [targetDate]: [...(s.tasks[targetDate] || []), newTask]
          },
          distractions: {
            ...s.distractions,
            [sourceDate]: s.distractions[sourceDate].map((d) =>
              d.id === id
                ? {
                    ...d,
                    status: 'converted' as const,
                    processedAt: Date.now(),
                    convertedToDate: targetDate,
                    convertedToTaskId: newTaskId
                  }
                : d
            )
          }
        }))
      },

      removeDistraction: (date, id) => {
        set((state) => {
          const list = state.distractions[date]
          if (!list) return state
          const updated = list.filter((d) => d.id !== id)
          const newDistractions = { ...state.distractions }
          if (updated.length === 0) {
            delete newDistractions[date]
          } else {
            newDistractions[date] = updated
          }
          return { distractions: newDistractions }
        })
      },

      getPendingDistractions: () => {
        const { distractions } = get()
        const pending: (Distraction & { _date: string })[] = []
        for (const [date, list] of Object.entries(distractions)) {
          for (const d of list) {
            if (d.status === 'pending') {
              pending.push({ ...d, _date: date })
            }
          }
        }
        return pending.sort((a, b) => a.createdAt - b.createdAt)
      },

      getPendingDistractionCount: () => {
        const { distractions } = get()
        let count = 0
        for (const list of Object.values(distractions)) {
          for (const d of list) {
            if (d.status === 'pending') count++
          }
        }
        return count
      },

      getDatesWithPendingDistractions: () => {
        const { distractions } = get()
        const dates: string[] = []
        for (const [date, list] of Object.entries(distractions)) {
          if (list.some((d) => d.status === 'pending')) {
            dates.push(date)
          }
        }
        return dates
      },

      createTaskRef: (originDate, taskId, targetDate) => {
        const state = get()
        const dateTasks = state.tasks[originDate]
        if (!dateTasks) return
        const task = findTaskInList(dateTasks, taskId)
        if (!task) return

        const refId = crypto.randomUUID()
        const ref: TaskRef = {
          id: refId,
          originDate,
          originTaskId: taskId,
          addedAt: Date.now()
        }

        set((s) => ({
          tasks: {
            ...s.tasks,
            [originDate]: updateTaskInList(s.tasks[originDate], taskId, (t) => ({
              ...t,
              references: [...(t.references || []), { date: targetDate, taskId: refId }]
            }))
          },
          taskRefs: {
            ...s.taskRefs,
            [targetDate]: [...(s.taskRefs[targetDate] || []), ref]
          }
        }))
      },

      toggleTaskRef: (refDate, refId) => {
        const state = get()
        const refs = state.taskRefs[refDate]
        if (!refs) return
        const ref = refs.find((r) => r.id === refId)
        if (!ref) return
        const originTasks = state.tasks[ref.originDate]
        if (!originTasks) return
        const task = findTaskInList(originTasks, ref.originTaskId)
        if (!task) return

        const nowCompleted = !task.completed
        set((s) => ({
          tasks: {
            ...s.tasks,
            [ref.originDate]: updateTaskInList(s.tasks[ref.originDate], ref.originTaskId, (t) => ({
              ...t,
              completed: nowCompleted,
              completedAt: nowCompleted ? Date.now() : undefined,
              completedFromDate: nowCompleted ? refDate : undefined
            }))
          }
        }))
      },

      removeTaskRef: (refDate, refId) => {
        const state = get()
        const refs = state.taskRefs[refDate]
        if (!refs) return
        const ref = refs.find((r) => r.id === refId)
        if (!ref) return

        const updatedRefs = refs.filter((r) => r.id !== refId)
        const newTaskRefs = { ...state.taskRefs }
        if (updatedRefs.length === 0) {
          delete newTaskRefs[refDate]
        } else {
          newTaskRefs[refDate] = updatedRefs
        }

        const originTasks = state.tasks[ref.originDate]
        if (!originTasks) {
          set({ taskRefs: newTaskRefs })
          return
        }

        set((s) => ({
          tasks: {
            ...s.tasks,
            [ref.originDate]: updateTaskInList(s.tasks[ref.originDate], ref.originTaskId, (t) => ({
              ...t,
              references: (t.references || []).filter((r) => r.taskId !== refId)
            }))
          },
          taskRefs: newTaskRefs
        }))
      },

      getResolvedTask: (ref) => {
        const originTasks = get().tasks[ref.originDate]
        if (!originTasks) return null
        return findTaskInList(originTasks, ref.originTaskId)
      },

      getPendingTasksAcrossDates: () => {
        const { tasks } = get()
        const result: Array<{ task: Task; date: string }> = []
        for (const [date, taskList] of Object.entries(tasks)) {
          if (date.includes('__block__')) continue
          for (const task of taskList) {
            if (!task.completed) {
              result.push({ task, date })
            }
          }
        }
        return result.sort((a, b) => b.date.localeCompare(a.date))
      },

      updateTaskEstimate: (date, taskId, minutes) => {
        set((state) => {
          const dateTasks = state.tasks[date]
          if (!dateTasks) return state
          return {
            tasks: {
              ...state.tasks,
              [date]: updateTaskInList(dateTasks, taskId, (task) => ({
                ...task,
                estimatedMinutes: minutes
              }))
            }
          }
        })
      },

      moveBlockTasks: (fromDate, blockId, toDate) => {
        set((state) => {
          const oldKey = `${fromDate}__block__${blockId}`
          const newKey = `${toDate}__block__${blockId}`
          const blockTasks = state.tasks[oldKey]
          const blockRefs = state.taskRefs[oldKey]
          const newTasks = { ...state.tasks }
          const newTaskRefs = { ...state.taskRefs }

          if (blockTasks) {
            delete newTasks[oldKey]
            newTasks[newKey] = blockTasks.map((t) => updateTaskDate(t, toDate))
          }

          if (blockRefs) {
            delete newTaskRefs[oldKey]
            newTaskRefs[newKey] = [...blockRefs]
          }

          return { tasks: newTasks, taskRefs: newTaskRefs }
        })
      },

      cleanOldDistractions: (daysToKeep = 90) => {
        const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000
        set((state) => {
          const newDistractions = { ...state.distractions }
          for (const [date, list] of Object.entries(newDistractions)) {
            const filtered = list.filter(
              (d) =>
                d.status === 'pending' ||
                !d.processedAt ||
                d.processedAt > cutoff
            )
            if (filtered.length === 0) {
              delete newDistractions[date]
            } else {
              newDistractions[date] = filtered
            }
          }
          return { distractions: newDistractions }
        })
      }
    }),
    {
      name: 'bloc-tasks',
      version: 3,
      partialize: (state) => {
        const cleanedTasks: Record<string, Task[]> = {}
        for (const [date, taskList] of Object.entries(state.tasks)) {
          cleanedTasks[date] = cleanExpandingFromTasks(taskList)
        }
        return {
          tasks: cleanedTasks,
          taskRefs: state.taskRefs,
          distractions: state.distractions
        }
      },
      migrate: (persisted: unknown, version: number) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let data = persisted as any

        if (version === 0 || version === undefined) {
          const old = data as { tasks?: Record<string, Task[]> }
          const tasks: Record<string, Task[]> = {}
          const distractions: Record<string, Distraction[]> = {}

          if (old.tasks) {
            for (const [key, taskList] of Object.entries(old.tasks)) {
              if (key.endsWith('__distractions')) {
                const date = key.replace('__distractions', '')
                distractions[date] = taskList.map((t) => ({
                  id: t.id,
                  text: t.text,
                  createdAt: t.createdAt,
                  sourceDate: date,
                  status: t.completed ? ('dismissed' as const) : ('pending' as const),
                  ...(t.completed ? { processedAt: Date.now() } : {})
                }))
              } else {
                tasks[key] = taskList
              }
            }
          }

          data = { ...old, tasks, distractions }
        }

        // v1 → v2: adicionar taskRefs
        if (!data.taskRefs) {
          data.taskRefs = {}
        }

        // v2 → v3: estimatedMinutes field added (optional, no migration needed)

        return data
      }
    }
  )
)

// Auto-resize blocks based on sum of task estimates
import { useTimeBlockStore } from './timeBlockStore'

const MIN_BLOCK_DURATION = 15 // minimum block size in minutes

useTaskStore.subscribe((state, prevState) => {
  const blockStore = useTimeBlockStore.getState()
  const allBlocks = blockStore.blocks

  for (const [key, tasks] of Object.entries(state.tasks)) {
    // Only process block keys (date__block__id)
    if (!key.includes('__block__')) continue

    const prevTasks = prevState.tasks[key]
    if (tasks === prevTasks) continue // no change in this block's tasks

    const parts = key.split('__block__')
    const date = parts[0]
    const blockId = parts[1]
    if (!date || !blockId) continue

    const blocks = allBlocks[date] || []
    const block = blocks.find((b) => b.id === blockId)
    if (!block || block.isGoogleReadOnly) continue

    // Sum estimates of non-completed tasks
    const totalMinutes = tasks.reduce((sum, t) => {
      if (t.completed) return sum
      return sum + (t.estimatedMinutes ?? 0)
    }, 0)

    const newEndTime = block.startTime + Math.max(totalMinutes, MIN_BLOCK_DURATION)
    if (newEndTime !== block.endTime) {
      useTimeBlockStore.getState().updateBlock(date, blockId, { endTime: newEndTime })
    }
  }
})
