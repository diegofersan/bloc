import { useState, useMemo } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, parseISO } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useTaskStore, BACKLOG_KEY } from '../stores/taskStore'
import { useTimeBlockStore } from '../stores/timeBlockStore'

interface PendingTasksPanelProps {
  currentDate: string
  projectTitle?: string
}

export default function PendingTasksPanel({ currentDate, projectTitle }: PendingTasksPanelProps) {
  const [search, setSearch] = useState('')
  const tasks = useTaskStore((s) => s.tasks)
  const taskRefs = useTaskStore((s) => s.taskRefs)
  const createTaskRef = useTaskStore((s) => s.createTaskRef)
  const removeTask = useTaskStore((s) => s.removeTask)
  const allBlocks = useTimeBlockStore((s) => s.blocks)
  const untimedBlocks = useTimeBlockStore((s) => s.untimedBlocks)

  const normalizedProject = projectTitle?.trim().toLowerCase()

  const { backlogItems, grouped } = useMemo(() => {
    const result: Array<{ task: { id: string; text: string; subtasks: Array<{ id: string; text: string; completed: boolean }> }; date: string; displayDate: string }> = []
    const backlog: typeof result = []

    for (const [dateKey, taskList] of Object.entries(tasks)) {
      const isUntimedBlock = dateKey.startsWith('__block__')
      const blockMatch = !isUntimedBlock ? dateKey.match(/^(.+)__block__(.+)$/) : null
      const baseDate = blockMatch ? blockMatch[1] : dateKey
      if (!isUntimedBlock && baseDate === currentDate) continue
      const isBacklog = dateKey === BACKLOG_KEY

      // When filtering by project, only include block-scoped tasks with matching title
      if (normalizedProject) {
        if (isUntimedBlock) {
          const untimedId = dateKey.slice('__block__'.length)
          const ub = untimedBlocks.find((b) => b.id === untimedId)
          if (!ub || ub.title.trim().toLowerCase() !== normalizedProject) continue
        } else {
          if (!blockMatch) continue // skip day-level tasks
          if (isBacklog) continue
          const blockId = blockMatch[2]
          const dateBlocks = allBlocks[baseDate] || []
          const block = dateBlocks.find((b) => b.id === blockId)
          if (!block || block.title.trim().toLowerCase() !== normalizedProject) continue
        }
      } else if (isUntimedBlock) {
        // No project filter: surface untimed-block tasks under "Sem data"
      }

      for (const task of taskList) {
        if (!task.completed) {
          const entry = {
            task: {
              id: task.id,
              text: task.text,
              subtasks: task.subtasks.map((s) => ({ id: s.id, text: s.text, completed: s.completed }))
            },
            date: dateKey,
            displayDate: baseDate
          }
          if (isBacklog || isUntimedBlock) {
            backlog.push(entry)
          } else {
            result.push(entry)
          }
        }
      }
    }

    // Build set of origin task IDs already referenced on currentDate
    const refsOnDate = taskRefs[currentDate] || []
    const linkedIds = new Set(refsOnDate.map((r) => r.originTaskId))

    // Filter out already-linked tasks
    const filtered = result.filter((item) => !linkedIds.has(item.task.id))
    const filteredBacklog = backlog.filter((item) => !linkedIds.has(item.task.id))

    // Apply search filter
    const query = search.trim().toLowerCase()
    const applySearch = <T extends { task: { text: string } }>(items: T[]) =>
      query ? items.filter((item) => item.task.text.toLowerCase().includes(query)) : items
    const searched = applySearch(filtered)
    const searchedBacklog = applySearch(filteredBacklog)

    // Group by display date (base date, not composite key)
    const groups = new Map<string, typeof searched>()
    for (const item of searched) {
      const list = groups.get(item.displayDate)
      if (list) {
        list.push(item)
      } else {
        groups.set(item.displayDate, [item])
      }
    }

    // Sort by date descending
    return {
      backlogItems: searchedBacklog,
      grouped: Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]))
    }
  }, [tasks, taskRefs, currentDate, search, normalizedProject, allBlocks, untimedBlocks])

  const isEmpty = grouped.length === 0 && backlogItems.length === 0

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-transparent focus-within:bg-bg-secondary/60 transition-colors border border-transparent focus-within:border-border">
          <Search size={14} className="shrink-0 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Procurar tarefas..."
            className="flex-1 text-sm bg-transparent border-none outline-none text-text-primary placeholder:text-text-muted"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-1 pb-3">
        {isEmpty ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-sm text-text-muted">
              {normalizedProject ? 'Nenhuma tarefa pendente neste projecto' : 'Nenhuma tarefa pendente'}
            </span>
          </div>
        ) : (
          <>
            {backlogItems.length > 0 && (
              <div className="mb-3">
                <div className="px-3 py-1.5">
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
                    Sem data
                  </span>
                </div>
                <AnimatePresence mode="popLayout">
                  {backlogItems.map((item) => (
                    <PendingTaskRow
                      key={item.task.id}
                      text={item.task.text}
                      subtasks={item.task.subtasks}
                      onLink={() => createTaskRef(item.date, item.task.id, currentDate)}
                      onDelete={() => removeTask(item.date, item.task.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
            {grouped.map(([date, items]) => (
              <div key={date} className="mb-3">
                <div className="px-3 py-1.5">
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
                    {format(parseISO(date), "d 'de' MMMM", { locale: pt })}
                  </span>
                </div>
                <AnimatePresence mode="popLayout">
                  {items.map((item) => (
                    <PendingTaskRow
                      key={item.task.id}
                      text={item.task.text}
                      subtasks={item.task.subtasks}
                      onLink={() => createTaskRef(item.date, item.task.id, currentDate)}
                      onDelete={() => removeTask(item.date, item.task.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function PendingTaskRow({ text, subtasks, onLink, onDelete }: {
  text: string
  subtasks: Array<{ id: string; text: string; completed: boolean }>
  onLink: () => void
  onDelete: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2 }}
      layout
    >
      <div className="group flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-bg-hover transition-colors">
        {/* Visual indicator */}
        <div className="shrink-0 w-3 h-3 rounded-full border-[1.5px] border-border opacity-40" />

        {/* Task text */}
        <span className="flex-1 text-sm text-text-primary truncate">{text}</span>

        {/* Link button */}
        <button
          onClick={onLink}
          aria-label="Trazer para hoje"
          className="shrink-0 p-1 rounded hover:bg-bg-tertiary transition-all opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <Plus size={14} className="text-accent" />
        </button>

        {/* Delete button */}
        <button
          onClick={onDelete}
          aria-label="Eliminar tarefa"
          className="shrink-0 p-1 rounded hover:bg-bg-tertiary transition-all opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <X size={14} className="text-text-muted hover:text-text-secondary transition-colors" />
        </button>
      </div>

      {/* Subtasks */}
      {subtasks.length > 0 && (
        <div className="ml-8 mr-3 mb-1">
          {subtasks.map((sub) => (
            <div key={sub.id} className="flex items-center gap-2 py-0.5 px-1">
              <div className={`shrink-0 w-1.5 h-1.5 rounded-full ${sub.completed ? 'bg-success' : 'bg-border'}`} />
              <span className={`text-xs truncate ${sub.completed ? 'line-through text-text-muted' : 'text-text-secondary'}`}>
                {sub.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
