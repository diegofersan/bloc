import { useState, useCallback, useRef, useMemo } from 'react'
import { useTaskStore, type Task } from '../stores/taskStore'
import { AnimatePresence } from 'framer-motion'
import EditableTaskRow from './EditableTaskRow'

interface TaskEditorProps {
  date: string
  tasks: Task[]
}

function flattenTaskIds(tasks: Task[]): string[] {
  const ids: string[] = []
  for (const task of tasks) {
    ids.push(task.id)
    if (task.subtasks.length > 0) {
      ids.push(...flattenTaskIds(task.subtasks))
    }
  }
  return ids
}

function findParentId(tasks: Task[], targetId: string): string | null {
  for (const task of tasks) {
    for (const sub of task.subtasks) {
      if (sub.id === targetId) return task.id
      const found = findParentId([sub], targetId)
      if (found) return found
    }
  }
  return null
}

export default function TaskEditor({ date, tasks }: TaskEditorProps) {
  const { addTask, removeTask, insertTaskAfter, insertSubtaskAfter, removeSubtask } = useTaskStore()
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const flatIds = useMemo(() => flattenTaskIds(tasks), [tasks])

  const handleClickEmpty = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.ghostArea) return
      addTask(date, '')
      requestAnimationFrame(() => {
        const store = useTaskStore.getState()
        const dateTasks = store.tasks[date] || []
        const last = dateTasks[dateTasks.length - 1]
        if (last) setActiveTaskId(last.id)
      })
    },
    [date, addTask]
  )

  const handleCreateBelow = useCallback(
    (taskId: string) => {
      // Check if taskId is a subtask
      const parentId = findParentId(tasks, taskId)
      if (parentId) {
        const newId = insertSubtaskAfter(date, parentId, taskId, '')
        requestAnimationFrame(() => setActiveTaskId(newId))
      } else {
        const newId = insertTaskAfter(date, taskId, '')
        requestAnimationFrame(() => setActiveTaskId(newId))
      }
    },
    [date, tasks, insertTaskAfter, insertSubtaskAfter]
  )

  const handleDeleteAndFocusAbove = useCallback(
    (taskId: string) => {
      const flatIndex = flatIds.indexOf(taskId)
      const parentId = findParentId(tasks, taskId)

      if (parentId) {
        removeSubtask(date, parentId, taskId)
      } else {
        if (tasks.length === 1 && tasks[0].text === '') return
        removeTask(date, taskId)
      }

      if (flatIndex > 0) {
        setActiveTaskId(flatIds[flatIndex - 1])
      } else if (flatIds.length > 1) {
        setActiveTaskId(flatIds[1])
      } else {
        setActiveTaskId(null)
      }
    },
    [date, tasks, flatIds, removeTask, removeSubtask]
  )

  const handleArrowUp = useCallback(
    (taskId: string) => {
      const idx = flatIds.indexOf(taskId)
      if (idx > 0) {
        setActiveTaskId(flatIds[idx - 1])
      }
    },
    [flatIds]
  )

  const handleArrowDown = useCallback(
    (taskId: string) => {
      const idx = flatIds.indexOf(taskId)
      if (idx < flatIds.length - 1) {
        setActiveTaskId(flatIds[idx + 1])
      }
    },
    [flatIds]
  )

  const handleBlurCleanup = useCallback(
    (taskId: string, text: string) => {
      if (text.trim() === '') {
        const topIndex = tasks.findIndex((t) => t.id === taskId)
        // Only auto-remove if it's the last task and empty
        if (topIndex === tasks.length - 1 && tasks.length > 1) {
          removeTask(date, taskId)
        }
      }
    },
    [date, tasks, removeTask]
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 pl-5 pr-5 pt-4 pb-3">
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Tarefas
        </h2>
      </div>

      <div
        ref={containerRef}
        role="list"
        className="flex-1 overflow-y-auto pl-5 pr-4 pb-6 cursor-text"
        onClick={handleClickEmpty}
      >
        {tasks.length === 0 ? (
          <div
            className="flex items-center justify-center h-full"
            data-ghost-area="true"
          >
            <p className="text-text-muted text-sm pointer-events-none select-none">
              Clique para começar a planear...
            </p>
          </div>
        ) : (
          <>
            <AnimatePresence>
              {tasks.map((task) => (
                <EditableTaskRow
                  key={task.id}
                  task={task}
                  date={date}
                  isFocused={activeTaskId === task.id}
                  activeTaskId={activeTaskId}
                  onFocus={() => setActiveTaskId(task.id)}
                  onCreateBelow={() => handleCreateBelow(task.id)}
                  onDeleteAndFocusAbove={() => handleDeleteAndFocusAbove(task.id)}
                  onArrowUp={() => handleArrowUp(task.id)}
                  onArrowDown={() => handleArrowDown(task.id)}
                  onSubtaskFocus={(id) => setActiveTaskId(id)}
                  onSubtaskCreateBelow={(id) => handleCreateBelow(id)}
                  onSubtaskDeleteAndFocusAbove={(id) => handleDeleteAndFocusAbove(id)}
                  onSubtaskArrowUp={(id) => handleArrowUp(id)}
                  onSubtaskArrowDown={(id) => handleArrowDown(id)}
                  onBlurCleanup={handleBlurCleanup}
                />
              ))}
            </AnimatePresence>
            {/* Ghost area below tasks — click to add new */}
            <div
              className="min-h-[100px] flex-1"
              data-ghost-area="true"
              onClick={handleClickEmpty}
            />
          </>
        )}
      </div>
    </div>
  )
}
