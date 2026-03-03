import { create } from 'zustand'
import type { Task } from './taskStore'

interface ClipboardState {
  task: Task | null
  fromKey: string | null
  taskId: string | null
  mode: 'move' | 'copy' | null
  setClipboard: (task: Task, fromKey: string, mode: 'move' | 'copy') => void
  clearClipboard: () => void
}

export const useClipboardStore = create<ClipboardState>()((set) => ({
  task: null,
  fromKey: null,
  taskId: null,
  mode: null,

  setClipboard: (task, fromKey, mode) =>
    set({
      task: structuredClone(task),
      fromKey,
      taskId: task.id,
      mode
    }),

  clearClipboard: () =>
    set({ task: null, fromKey: null, taskId: null, mode: null })
}))
