import { useMemo, useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Calendar, X, ArrowRight, Inbox, ListTodo, Eye, EyeOff, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, parseISO } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useTaskStore, type Distraction, type Task } from '../stores/taskStore'
import { useTimeBlockStore } from '../stores/timeBlockStore'

type Tab = 'inbox' | 'tasks'

export default function InboxView() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as Tab) || 'inbox'
  const [tab, setTab] = useState<Tab>(initialTab)

  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function switchTab(t: Tab) {
    setTab(t)
    setSearchParams(t === 'inbox' ? {} : { tab: t }, { replace: true })
  }

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Titlebar */}
      <div className={`titlebar-drag shrink-0 flex items-end pb-2 ${isNarrow ? 'px-3 pt-[38px]' : 'pl-5 pr-6 pt-[50px]'}`}>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/')}
          aria-label="Voltar"
          className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <ArrowLeft size={18} />
        </motion.button>
      </div>

      {/* Tabs */}
      <div className={`shrink-0 flex gap-1 pb-2 ${isNarrow ? 'px-3' : 'pl-5 pr-6'}`}>
        <button
          onClick={() => switchTab('inbox')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'inbox'
              ? 'bg-bg-secondary text-text-primary'
              : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
          }`}
        >
          <Inbox size={14} />
          Inbox
        </button>
        <button
          onClick={() => switchTab('tasks')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'tasks'
              ? 'bg-bg-secondary text-text-primary'
              : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
          }`}
        >
          <ListTodo size={14} />
          Tarefas
        </button>
      </div>

      {/* Content */}
      {tab === 'inbox' ? (
        <InboxTab isNarrow={isNarrow} navigate={navigate} />
      ) : (
        <TasksTab isNarrow={isNarrow} navigate={navigate} />
      )}
    </div>
  )
}

// ── Inbox Tab (distractions) ──────────────────────────────────────

function InboxTab({ isNarrow, navigate }: { isNarrow: boolean; navigate: ReturnType<typeof useNavigate> }) {
  const getPendingDistractions = useTaskStore((s) => s.getPendingDistractions)
  const convertToTask = useTaskStore((s) => s.convertToTask)
  const dismissDistraction = useTaskStore((s) => s.dismissDistraction)

  const pending = getPendingDistractions()

  const grouped = useMemo(() => {
    const groups: Record<string, (Distraction & { _date: string })[]> = {}
    for (const d of pending) {
      const date = d._date
      if (!groups[date]) groups[date] = []
      groups[date].push(d)
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  }, [pending])

  const today = format(new Date(), 'yyyy-MM-dd')

  function handleConvertAll() {
    for (const d of pending) {
      convertToTask(d._date, d.id, today)
    }
  }

  return (
    <div className={`flex-1 overflow-y-auto pb-8 ${isNarrow ? 'px-3' : 'pl-5 pr-6'}`}>
      <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4 pt-4">
        Caixa de Entrada
      </h2>

      {pending.length > 0 ? (
        <>
          <div className={`flex mb-6 ${isNarrow ? 'flex-col gap-2' : 'items-center justify-between'}`}>
            <p className="text-sm text-text-muted">
              {pending.length} {pending.length === 1 ? 'distração por processar' : 'distrações por processar'}
            </p>
            <button
              onClick={handleConvertAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent bg-accent-subtle rounded-lg hover:bg-accent/10 transition-colors"
            >
              <ArrowRight size={12} />
              Converter tudo para hoje
            </button>
          </div>

          {grouped.map(([date, items]) => (
            <div key={date} className="mb-6">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 sticky top-0 bg-bg-primary py-1">
                {format(parseISO(date), 'd MMM', { locale: pt }).toUpperCase()}
              </h3>
              <AnimatePresence>
                {items.map((d) => (
                  <motion.div
                    key={d.id}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -16, transition: { duration: 0.15 } }}
                    transition={{ duration: 0.2 }}
                    className="group flex items-center gap-3 py-2.5 px-4 rounded-lg hover:bg-bg-hover transition-colors"
                  >
                    <div className="shrink-0 w-2 h-2 rounded-full border border-distraction" />
                    <span className="shrink-0 text-xs text-text-muted tabular-nums">
                      {format(d.createdAt, 'HH:mm')}
                    </span>
                    <span className="flex-1 text-sm text-text-primary">{d.text}</span>

                    <button
                      onClick={() => convertToTask(d._date, d.id, today)}
                      className={`shrink-0 px-2 py-1 text-xs font-medium text-accent bg-accent-subtle rounded hover:bg-accent/10 transition-colors ${isNarrow ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
                    >
                      Hoje
                    </button>

                    <button
                      onClick={() => navigate(`/day/${d._date}`)}
                      aria-label="Escolher data"
                      className={`shrink-0 p-1 rounded hover:bg-bg-tertiary transition-all ${isNarrow ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
                    >
                      <Calendar size={14} className="text-text-muted" />
                    </button>

                    <button
                      onClick={() => dismissDistraction(d._date, d.id)}
                      aria-label="Descartar distração"
                      className={`shrink-0 p-1 rounded hover:bg-bg-tertiary transition-all ${isNarrow ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
                    >
                      <X size={14} className="text-text-muted hover:text-text-secondary transition-colors" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ))}
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center justify-center h-full text-center"
        >
          <p className="text-lg font-medium text-text-primary mb-1">Tudo processado.</p>
          <p className="text-sm text-text-muted">Sem distrações pendentes.</p>
        </motion.div>
      )}
    </div>
  )
}

// ── Tasks Tab ─────────────────────────────────────────────────────

function countSubtaskStats(subtasks: Task[]): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const s of subtasks) {
    total++
    if (s.completed) done++
    if (s.subtasks.length > 0) {
      const nested = countSubtaskStats(s.subtasks)
      done += nested.done
      total += nested.total
    }
  }
  return { done, total }
}

interface TaskEntry {
  task: Task
  dateKey: string       // composite key (may contain __block__)
  baseDate: string      // YYYY-MM-DD
  blockId: string | null
  blockTitle: string | null
}

function TasksTab({ isNarrow, navigate }: { isNarrow: boolean; navigate: ReturnType<typeof useNavigate> }) {
  const tasks = useTaskStore((s) => s.tasks)
  const allBlocks = useTimeBlockStore((s) => s.blocks)
  const [showCompleted, setShowCompleted] = useState(false)

  const grouped = useMemo(() => {
    const entries: TaskEntry[] = []

    for (const [dateKey, taskList] of Object.entries(tasks)) {
      const blockMatch = dateKey.match(/^(.+)__block__(.+)$/)
      const baseDate = blockMatch ? blockMatch[1] : dateKey
      const blockId = blockMatch ? blockMatch[2] : null

      let blockTitle: string | null = null
      if (blockId) {
        const dateBlocks = allBlocks[baseDate]
        const block = dateBlocks?.find((b) => b.id === blockId)
        blockTitle = block?.title || null
      }

      for (const task of taskList) {
        if (!showCompleted && task.completed) continue
        entries.push({ task, dateKey, baseDate, blockId, blockTitle })
      }
    }

    // Group by baseDate
    const groups = new Map<string, TaskEntry[]>()
    for (const entry of entries) {
      const list = groups.get(entry.baseDate)
      if (list) list.push(entry)
      else groups.set(entry.baseDate, [entry])
    }

    return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [tasks, allBlocks, showCompleted])

  const totalCount = useMemo(() => {
    return grouped.reduce((acc, [, items]) => acc + items.length, 0)
  }, [grouped])

  return (
    <div className={`flex-1 overflow-y-auto pb-8 ${isNarrow ? 'px-3' : 'pl-5 pr-6'}`}>
      <div className="flex items-center justify-between pt-4 mb-4">
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Todas as Tarefas
        </h2>
        <button
          onClick={() => setShowCompleted((v) => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-text-muted hover:text-text-secondary rounded-lg hover:bg-bg-hover transition-colors"
        >
          {showCompleted ? <EyeOff size={12} /> : <Eye size={12} />}
          {showCompleted ? 'Esconder concluídas' : 'Mostrar concluídas'}
        </button>
      </div>

      {totalCount > 0 ? (
        grouped.map(([baseDate, items]) => (
          <div key={baseDate} className="mb-5">
            <button
              onClick={() => navigate(`/day/${baseDate}`)}
              className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 sticky top-0 bg-bg-primary py-1 hover:text-accent transition-colors"
            >
              {format(parseISO(baseDate), "EEEE, d 'de' MMMM", { locale: pt })}
            </button>

            {items.map((entry) => (
              <TaskItem key={`${entry.dateKey}-${entry.task.id}`} entry={entry} navigate={navigate} showCompleted={showCompleted} />
            ))}
          </div>
        ))
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center justify-center h-full text-center"
        >
          <p className="text-lg font-medium text-text-primary mb-1">
            {showCompleted ? 'Sem tarefas.' : 'Tudo concluído.'}
          </p>
          <p className="text-sm text-text-muted">
            {showCompleted ? 'Nenhuma tarefa registada.' : 'Sem tarefas pendentes.'}
          </p>
        </motion.div>
      )}
    </div>
  )
}

function TaskItem({ entry, navigate, showCompleted }: {
  entry: TaskEntry
  navigate: ReturnType<typeof useNavigate>
  showCompleted: boolean
}) {
  const { task, dateKey, baseDate, blockId, blockTitle } = entry
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const sub = countSubtaskStats(task.subtasks)
  const visibleSubtasks = showCompleted ? task.subtasks : task.subtasks.filter((s) => !s.completed)

  const handleNavigate = () => {
    if (blockId) {
      navigate(`/day/${baseDate}?block=${blockId}`)
    } else {
      navigate(`/day/${baseDate}`)
    }
  }

  return (
    <div>
      <div className="group flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-bg-hover transition-colors">
        <button
          onClick={() => toggleTask(dateKey, task.id)}
          className={`shrink-0 w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center transition-all ${
            task.completed
              ? 'bg-success border-success'
              : 'border-border hover:border-border-light'
          }`}
        >
          {task.completed && (
            <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
              <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {sub.total > 0 && (
          <span className={`text-xs tabular-nums ${sub.done === sub.total ? 'text-success font-medium' : 'text-text-muted'}`}>
            {sub.done}/{sub.total}
          </span>
        )}

        <span className={`flex-1 text-sm truncate ${task.completed ? 'line-through text-text-muted' : 'text-text-primary'}`}>
          {task.text || 'Sem título'}
        </span>

        {blockTitle && (
          <span className="shrink-0 flex items-center gap-1 text-xs text-text-muted">
            <Clock size={10} />
            {blockTitle}
          </span>
        )}

        <button
          onClick={handleNavigate}
          aria-label={blockId ? 'Ir para o bloco' : 'Ir para o dia'}
          className="shrink-0 p-1 rounded hover:bg-bg-tertiary transition-all opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <Calendar size={12} className="text-text-muted" />
        </button>
      </div>

      {visibleSubtasks.length > 0 && (
        <div className="ml-8 mr-3">
          {visibleSubtasks.map((s) => (
            <SubtaskItem key={s.id} task={s} parentId={task.id} date={dateKey} showCompleted={showCompleted} />
          ))}
        </div>
      )}
    </div>
  )
}

function SubtaskItem({ task, parentId, date, showCompleted }: {
  task: Task
  parentId: string
  date: string
  showCompleted: boolean
}) {
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const visibleSubtasks = showCompleted ? task.subtasks : task.subtasks.filter((s) => !s.completed)

  return (
    <div>
      <div className="flex items-center gap-2.5 py-1.5 px-2 rounded hover:bg-bg-hover/50 transition-colors">
        <button
          onClick={() => toggleTask(date, task.id)}
          className={`shrink-0 w-3.5 h-3.5 rounded-sm border-[1.5px] flex items-center justify-center transition-all ${
            task.completed
              ? 'bg-success border-success'
              : 'border-border hover:border-border-light'
          }`}
        >
          {task.completed && (
            <svg width="7" height="7" viewBox="0 0 12 12" fill="none">
              <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <span className={`flex-1 text-xs truncate ${task.completed ? 'line-through text-text-muted' : 'text-text-secondary'}`}>
          {task.text || 'Sem título'}
        </span>
      </div>

      {visibleSubtasks.length > 0 && (
        <div className="ml-5">
          {visibleSubtasks.map((s) => (
            <SubtaskItem key={s.id} task={s} parentId={task.id} date={date} showCompleted={showCompleted} />
          ))}
        </div>
      )}
    </div>
  )
}
