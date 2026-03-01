import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Task {
  id: string
  text: string
  completed: boolean
  completedAt?: number
  subtasks: Task[]
  date: string
  createdAt: number
  isExpanding?: boolean
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
}

interface TaskState {
  tasks: Record<string, Task[]>
  distractions: Record<string, Distraction[]>
  lastDeleted: DeletedTask | null
  addTask: (date: string, text: string) => void
  toggleTask: (date: string, taskId: string) => void
  removeTask: (date: string, taskId: string) => void
  undoDelete: () => void
  addSubtasks: (date: string, taskId: string, subtaskTexts: string[]) => void
  addSubtaskToSubtask: (date: string, taskId: string, subtaskId: string, subtaskTexts: string[]) => void
  setTaskExpanding: (date: string, taskId: string, expanding: boolean) => void
  updateTaskText: (date: string, taskId: string, text: string) => void
  insertTaskAfter: (date: string, afterTaskId: string, text: string) => string
  insertSubtaskAfter: (date: string, parentId: string, afterSubtaskId: string, text: string) => string
  removeSubtask: (date: string, parentId: string, subtaskId: string) => void
  getTasksForDate: (date: string) => Task[]
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
          return {
            tasks: newTasks,
            lastDeleted: task ? { task, date, index: Math.max(0, index) } : state.lastDeleted
          }
        })
      },

      undoDelete: () => {
        const { lastDeleted } = get()
        if (!lastDeleted) return
        set((state) => {
          const dateTasks = [...(state.tasks[lastDeleted.date] || [])]
          const idx = Math.min(lastDeleted.index, dateTasks.length)
          dateTasks.splice(idx, 0, lastDeleted.task)
          return {
            tasks: { ...state.tasks, [lastDeleted.date]: dateTasks },
            lastDeleted: null
          }
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

      getTasksForDate: (date) => {
        return get().tasks[date] || []
      },

      getDatesWithTasks: () => {
        return Object.keys(get().tasks).filter((date) => get().tasks[date].length > 0)
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
      version: 1,
      partialize: (state) => {
        const cleanedTasks: Record<string, Task[]> = {}
        for (const [date, taskList] of Object.entries(state.tasks)) {
          cleanedTasks[date] = cleanExpandingFromTasks(taskList)
        }
        return {
          tasks: cleanedTasks,
          distractions: state.distractions
        }
      },
      migrate: (persisted: unknown, version: number) => {
        if (version === 0 || version === undefined) {
          const old = persisted as { tasks?: Record<string, Task[]> }
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

          return { ...old, tasks, distractions }
        }
        return persisted
      }
    }
  )
)
