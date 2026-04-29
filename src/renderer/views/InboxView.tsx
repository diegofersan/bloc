import { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Calendar, X, Inbox, ListTodo, Eye, EyeOff, Plus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, parseISO } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useTaskStore, type Distraction, type Task, type BlockGroup, BACKLOG_KEY } from '../stores/taskStore'
import { useTimeBlockStore } from '../stores/timeBlockStore'
import CreateBlockModal from '../components/CreateBlockModal'

const COLOR_DOT_CLASS: Record<string, string> = {
  indigo: 'bg-indigo-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  sky: 'bg-sky-500',
  violet: 'bg-violet-500',
  slate: 'bg-slate-500'
}

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
  const removeDistraction = useTaskStore((s) => s.removeDistraction)

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

  return (
    <div className={`flex-1 overflow-y-auto pb-8 ${isNarrow ? 'px-3' : 'pl-5 pr-6'}`}>
      <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4 pt-4">
        Caixa de Entrada
      </h2>

      {pending.length > 0 ? (
        <>
          <div className="mb-6">
            <p className="text-sm text-text-muted">
              {pending.length} {pending.length === 1 ? 'distração por processar' : 'distrações por processar'}
            </p>
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
                      onClick={() => removeDistraction(d._date, d.id)}
                      aria-label="Remover distração"
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

function TasksTab({ isNarrow, navigate }: { isNarrow: boolean; navigate: ReturnType<typeof useNavigate> }) {
  const tasks = useTaskStore((s) => s.tasks)
  const getTasksGroupedByBlockTitle = useTaskStore((s) => s.getTasksGroupedByBlockTitle)
  const untimedBlocks = useTimeBlockStore((s) => s.untimedBlocks)
  const allBlocks = useTimeBlockStore((s) => s.blocks)
  const [showCompleted, setShowCompleted] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  // Recompute via deps so cross-store changes trigger a re-render. The selector
  // itself reads both stores but Zustand subscriptions only fire for the store
  // it's bound to, so we list tasks/untimedBlocks/allBlocks explicitly.
  const groups: BlockGroup[] = useMemo(
    () => getTasksGroupedByBlockTitle(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, untimedBlocks, allBlocks, getTasksGroupedByBlockTitle]
  )

  const totalPending = useMemo(() => {
    let n = 0
    for (const g of groups) {
      for (const it of g.items) {
        if (!it.task.completed && !it.task.wontDo) n++
      }
    }
    return n
  }, [groups])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className={`flex-1 overflow-y-auto pb-8 ${isNarrow ? 'px-3' : 'pl-5 pr-6'}`}>
        <div className="flex items-center justify-between pt-4 mb-4 gap-2">
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors"
          >
            <Plus size={14} />
            Criar bloco
          </button>
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-text-muted hover:text-text-secondary rounded-lg hover:bg-bg-hover transition-colors"
          >
            {showCompleted ? <EyeOff size={12} /> : <Eye size={12} />}
            {showCompleted ? 'Esconder concluídas' : 'Mostrar concluídas'}
          </button>
        </div>

        {totalPending === 0 && groups.every((g) => g.items.length === 0) ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center text-center py-16"
          >
            <p className="text-sm text-text-muted">Sem tarefas. Cria um bloco para começar.</p>
          </motion.div>
        ) : (
          groups.map((group) => (
            <BlockGroupView
              key={group.blockId ?? '__sem_bloco__'}
              group={group}
              showCompleted={showCompleted}
              navigate={navigate}
            />
          ))
        )}
      </div>

      <CreateBlockModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

function BlockGroupView({
  group,
  showCompleted,
  navigate
}: {
  group: BlockGroup
  showCompleted: boolean
  navigate: ReturnType<typeof useNavigate>
}) {
  const addTask = useTaskStore((s) => s.addTask)
  const addUntimedBlock = useTimeBlockStore((s) => s.addUntimedBlock)
  const removeUntimedBlock = useTimeBlockStore((s) => s.removeUntimedBlock)
  const untimedBlocks = useTimeBlockStore((s) => s.untimedBlocks)
  const allBlocks = useTimeBlockStore((s) => s.blocks)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const visibleItems = useMemo(
    () => group.items.filter((it) => showCompleted || (!it.task.completed && !it.task.wontDo)),
    [group.items, showCompleted]
  )
  const pendingCount = useMemo(
    () => group.items.filter((it) => !it.task.completed && !it.task.wontDo).length,
    [group.items]
  )

  useEffect(() => {
    if (adding) setTimeout(() => inputRef.current?.focus(), 30)
  }, [adding])

  function commitNewTask() {
    const text = draft.trim()
    if (!text) {
      setAdding(false)
      setDraft('')
      return
    }
    let targetKey: string

    if (group.blockId === null) {
      // "Sem bloco" → backlog
      targetKey = BACKLOG_KEY
    } else {
      // Group identified by title. Resolve a hosting key:
      //   1) prefer an existing untimed block with the same title (case-insensitive trimmed)
      //   2) otherwise auto-create one (bridge), inheriting color from the group
      const titleKey = group.title.trim().toLowerCase()
      const existingUntimed = untimedBlocks.find(
        (b) => b.title.trim().toLowerCase() === titleKey
      )
      let hostId = existingUntimed?.id
      if (!hostId) {
        // Pick a sensible color: group's resolved color or first dated instance, fallback indigo
        let color = group.color
        if (!color) {
          for (const dateBlocks of Object.values(allBlocks)) {
            const match = dateBlocks.find((b) => b.title.trim().toLowerCase() === titleKey)
            if (match) {
              color = match.color
              break
            }
          }
        }
        hostId = addUntimedBlock({ title: group.title, color: color ?? 'indigo' })
      }
      targetKey = `__block__${hostId}`
    }

    addTask(targetKey, text)
    setDraft('')
    // Keep the input open for chained captures, but blur if Esc/blur handler runs.
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const isSemBloco = group.blockId === null
  const titleKey = group.title.trim().toLowerCase()
  const matchingUntimed = useMemo(
    () => (isSemBloco ? [] : untimedBlocks.filter((b) => b.title.trim().toLowerCase() === titleKey)),
    [untimedBlocks, titleKey, isSemBloco]
  )
  const canDelete = !isSemBloco && group.items.length === 0 && matchingUntimed.length > 0

  function handleDelete() {
    for (const ub of matchingUntimed) removeUntimedBlock(ub.id)
  }

  return (
    <div className="mb-5">
      <div className="group/header flex items-center gap-2 mb-2 sticky top-0 bg-bg-primary py-1 z-[1]">
        {!isSemBloco && (
          <span
            className={`shrink-0 w-2.5 h-2.5 rounded-full ${COLOR_DOT_CLASS[group.color ?? 'slate'] ?? 'bg-slate-500'}`}
          />
        )}
        <h3
          className={`flex-1 text-xs font-semibold uppercase tracking-wider ${
            isSemBloco ? 'text-text-muted/70 italic' : 'text-text-secondary'
          }`}
        >
          {group.title}
        </h3>
        {pendingCount > 0 && (
          <span className="text-[10px] tabular-nums text-text-muted">{pendingCount}</span>
        )}
        {canDelete && (
          <button
            onClick={handleDelete}
            aria-label="Eliminar bloco vazio"
            className="p-1 rounded text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors opacity-0 group-hover/header:opacity-100 focus:opacity-100"
          >
            <X size={14} />
          </button>
        )}
        <button
          onClick={() => setAdding((v) => !v)}
          aria-label="Adicionar tarefa"
          className="p-1 rounded text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.12 }}
            className="overflow-hidden"
          >
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitNewTask()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setAdding(false)
                  setDraft('')
                }
              }}
              onBlur={() => {
                if (!draft.trim()) {
                  setAdding(false)
                }
              }}
              placeholder="Nova tarefa…"
              className="w-full px-3 py-1.5 mb-1 text-sm bg-bg-secondary border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {visibleItems.length === 0 && !adding ? (
        <p className="text-xs text-text-muted/70 px-3 py-2">Sem tarefas neste bloco.</p>
      ) : (
        visibleItems.map((it) => (
          <TaskItem
            key={`${it.storeKey}-${it.task.id}`}
            task={it.task}
            storeKey={it.storeKey}
            date={it.date}
            blockInstanceId={it.blockInstanceId}
            navigate={navigate}
            showCompleted={showCompleted}
          />
        ))
      )}
    </div>
  )
}

function TaskItem({
  task,
  storeKey,
  date,
  blockInstanceId,
  navigate,
  showCompleted
}: {
  task: Task
  storeKey: string
  date: string | null
  blockInstanceId: string | null
  navigate: ReturnType<typeof useNavigate>
  showCompleted: boolean
}) {
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const removeTask = useTaskStore((s) => s.removeTask)
  const sub = countSubtaskStats(task.subtasks)
  const visibleSubtasks = showCompleted ? task.subtasks : task.subtasks.filter((s) => !s.completed)

  const canNavigate = date !== null
  const handleNavigate = () => {
    if (!date) return
    if (blockInstanceId) {
      navigate(`/day/${date}?block=${blockInstanceId}`)
    } else {
      navigate(`/day/${date}`)
    }
  }

  return (
    <div>
      <div className="group flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-bg-hover transition-colors">
        <button
          onClick={() => toggleTask(storeKey, task.id)}
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

        {date && (
          <span className="shrink-0 text-[10px] text-text-muted tabular-nums">
            {format(parseISO(date), 'd MMM', { locale: pt })}
          </span>
        )}

        {canNavigate && (
          <button
            onClick={handleNavigate}
            aria-label="Ir para o dia"
            className="shrink-0 p-1 rounded hover:bg-bg-tertiary transition-all opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <Calendar size={12} className="text-text-muted" />
          </button>
        )}

        <button
          onClick={() => removeTask(storeKey, task.id)}
          aria-label="Eliminar tarefa"
          className="shrink-0 p-1 rounded hover:bg-bg-tertiary transition-all opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <X size={14} className="text-text-muted hover:text-text-secondary transition-colors" />
        </button>
      </div>

      {visibleSubtasks.length > 0 && (
        <div className="ml-8 mr-3">
          {visibleSubtasks.map((s) => (
            <SubtaskItem key={s.id} task={s} storeKey={storeKey} showCompleted={showCompleted} />
          ))}
        </div>
      )}
    </div>
  )
}

function SubtaskItem({
  task,
  storeKey,
  showCompleted
}: {
  task: Task
  storeKey: string
  showCompleted: boolean
}) {
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const visibleSubtasks = showCompleted ? task.subtasks : task.subtasks.filter((s) => !s.completed)

  return (
    <div>
      <div className="flex items-center gap-2.5 py-1.5 px-2 rounded hover:bg-bg-hover/50 transition-colors">
        <button
          onClick={() => toggleTask(storeKey, task.id)}
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
            <SubtaskItem key={s.id} task={s} storeKey={storeKey} showCompleted={showCompleted} />
          ))}
        </div>
      )}
    </div>
  )
}
