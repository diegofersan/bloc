import { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Calendar, X, Inbox, Boxes, Eye, EyeOff, Plus, Search } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, parseISO } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useTaskStore, type Distraction, type Task, type BlockGroup, BACKLOG_KEY } from '../stores/taskStore'
import { useTimeBlockStore } from '../stores/timeBlockStore'
import { useSettingsStore } from '../stores/settingsStore'
import CreateBlockModal from '../components/CreateBlockModal'
import DeleteBlockConfirmModal from '../components/DeleteBlockConfirmModal'
import { COLOR_MAP } from '../components/TimeBlockItem'

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
          <Boxes size={14} />
          Blocos
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

function hasPendingItems(group: BlockGroup): boolean {
  return group.items.some((it) => !it.task.completed && !it.task.wontDo)
}

function TasksTab({ isNarrow, navigate }: { isNarrow: boolean; navigate: ReturnType<typeof useNavigate> }) {
  const tasks = useTaskStore((s) => s.tasks)
  const getTasksGroupedByBlockTitle = useTaskStore((s) => s.getTasksGroupedByBlockTitle)
  const untimedBlocks = useTimeBlockStore((s) => s.untimedBlocks)
  const allBlocks = useTimeBlockStore((s) => s.blocks)
  const hideEmptyBlocks = useSettingsStore((s) => s.hideEmptyBlocks)
  const setHideEmptyBlocks = useSettingsStore((s) => s.setHideEmptyBlocks)
  const [showCompleted, setShowCompleted] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Recompute via deps so cross-store changes trigger a re-render. The selector
  // itself reads both stores but Zustand subscriptions only fire for the store
  // it's bound to, so we list tasks/untimedBlocks/allBlocks explicitly.
  const groups: BlockGroup[] = useMemo(
    () => getTasksGroupedByBlockTitle(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, untimedBlocks, allBlocks, getTasksGroupedByBlockTitle]
  )

  const filteredGroups = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return groups.filter((g) => {
      if (g.blockId === null) {
        // "Sem bloco": só aparece quando não há pesquisa
        if (term !== '') return false
        if (hideEmptyBlocks && !hasPendingItems(g)) return false
        return true
      }
      if (term && !g.title.toLowerCase().includes(term)) return false
      if (hideEmptyBlocks && !hasPendingItems(g)) return false
      return true
    })
  }, [groups, searchTerm, hideEmptyBlocks])

  // Local ⌘F (or Ctrl+F) to focus search input
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const noData = groups.every((g) => g.items.length === 0)
  const noMatches = !noData && filteredGroups.length === 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className={`flex-1 overflow-y-auto pb-8 ${isNarrow ? 'px-3' : 'pl-5 pr-6'}`}>
        <div className="flex items-center pt-4 mb-3 gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted/60" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar bloco…"
              className="w-full pl-7 pr-7 py-1 text-xs bg-bg-secondary/60 border border-border/40 rounded-lg text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 focus:bg-bg-secondary"
              spellCheck={false}
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('')
                  searchInputRef.current?.focus()
                }}
                aria-label="Limpar pesquisa"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mb-4 gap-2">
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors"
          >
            <Plus size={14} />
            Criar bloco
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setHideEmptyBlocks(!hideEmptyBlocks)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-text-muted hover:text-text-secondary rounded-lg hover:bg-bg-hover transition-colors"
            >
              {hideEmptyBlocks ? <Eye size={12} /> : <EyeOff size={12} />}
              {hideEmptyBlocks ? 'Mostrar vazios' : 'Ocultar vazios'}
            </button>
            <button
              onClick={() => setShowCompleted((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-text-muted hover:text-text-secondary rounded-lg hover:bg-bg-hover transition-colors"
            >
              {showCompleted ? <EyeOff size={12} /> : <Eye size={12} />}
              {showCompleted ? 'Esconder concluídas' : 'Mostrar concluídas'}
            </button>
          </div>
        </div>

        {noData ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center text-center py-16"
          >
            <p className="text-sm text-text-muted">Sem tarefas. Cria um bloco para começar.</p>
          </motion.div>
        ) : noMatches ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center text-center py-16 gap-2"
          >
            {searchTerm.trim() ? (
              <>
                <p className="text-sm text-text-muted">
                  Nenhum bloco corresponde a "{searchTerm.trim()}".
                </p>
                <button
                  onClick={() => setSearchTerm('')}
                  className="text-xs text-accent hover:underline"
                >
                  Limpar pesquisa
                </button>
              </>
            ) : (
              <p className="text-sm text-text-muted">Sem blocos com tarefas pendentes.</p>
            )}
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
            {filteredGroups.map((group) => (
              <BlockGroupView
                key={group.blockId ?? '__sem_bloco__'}
                group={group}
                showCompleted={showCompleted}
                navigate={navigate}
              />
            ))}
          </div>
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
  const removeTask = useTaskStore((s) => s.removeTask)
  const moveTask = useTaskStore((s) => s.moveTask)
  const addUntimedBlock = useTimeBlockStore((s) => s.addUntimedBlock)
  const removeUntimedBlock = useTimeBlockStore((s) => s.removeUntimedBlock)
  const untimedBlocks = useTimeBlockStore((s) => s.untimedBlocks)
  const allBlocks = useTimeBlockStore((s) => s.blocks)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [isDropTarget, setIsDropTarget] = useState(false)
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

  // Resolve which storeKey hosts new/moved tasks for this group.
  // For "Sem bloco" → backlog; otherwise auto-create the untimed bridge if needed.
  function resolveTargetKey(): string {
    if (group.blockId === null) return BACKLOG_KEY
    const titleKey = group.title.trim().toLowerCase()
    const existingUntimed = untimedBlocks.find(
      (b) => b.title.trim().toLowerCase() === titleKey
    )
    let hostId = existingUntimed?.id
    if (!hostId) {
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
    return `__block__${hostId}`
  }

  function commitNewTask() {
    const text = draft.trim()
    if (!text) {
      setAdding(false)
      setDraft('')
      return
    }
    addTask(resolveTargetKey(), text)
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
  const canDelete = !isSemBloco

  function confirmDelete() {
    // 1. Apagar todas as tarefas em qualquer storeKey
    for (const it of group.items) {
      removeTask(it.storeKey, it.task.id)
    }
    // 2. Apagar untimed blocks correspondentes (se existirem)
    for (const ub of matchingUntimed) {
      removeUntimedBlock(ub.id)
    }
    // 3. TimeBlock agendados ficam intactos (decisão de spec)
    setConfirmDeleteOpen(false)
  }

  // ── Drop target ───────────────────────────────────────────────────
  const acceptsDrop = !isSemBloco

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!acceptsDrop) return
    if (!e.dataTransfer.types.includes('application/x-bloc-task')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!isDropTarget) setIsDropTarget(true)
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    // Only clear when the cursor truly leaves the group container, not when
    // it crosses a child element boundary.
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDropTarget(false)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    setIsDropTarget(false)
    if (!acceptsDrop) return
    const raw = e.dataTransfer.getData('application/x-bloc-task')
    if (!raw) return
    e.preventDefault()
    let payload: { storeKey?: string; taskId?: string }
    try {
      payload = JSON.parse(raw)
    } catch {
      return
    }
    const fromKey = payload.storeKey
    const taskId = payload.taskId
    if (!fromKey || !taskId) return
    const targetKey = resolveTargetKey()
    if (fromKey === targetKey) return
    moveTask(fromKey, targetKey, taskId)
  }

  const colors = isSemBloco ? COLOR_MAP.slate : COLOR_MAP[group.color ?? 'slate']

  return (
    <div
      className={`group/card rounded-lg border ${colors.border} ${colors.bg} p-3 transition-shadow ${
        isDropTarget ? 'ring-2 ring-accent/60 shadow-lg' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="group/header flex items-center gap-2 mb-2">
        <h3
          className={`flex-1 text-sm font-semibold truncate ${
            isSemBloco ? 'text-text-muted/70 italic' : colors.text
          }`}
        >
          {group.title}
        </h3>
        {pendingCount > 0 && (
          <span className={`text-[10px] tabular-nums ${isSemBloco ? 'text-text-muted' : colors.text + ' opacity-70'}`}>
            {pendingCount}
          </span>
        )}
        {canDelete && (
          <button
            onClick={() => setConfirmDeleteOpen(true)}
            aria-label="Eliminar bloco"
            className="p-1 rounded text-text-muted hover:text-rose-500 hover:bg-black/5 transition-colors opacity-0 group-hover/card:opacity-100 focus:opacity-100"
          >
            <X size={14} />
          </button>
        )}
        <button
          onClick={() => setAdding((v) => !v)}
          aria-label="Adicionar tarefa"
          className="p-1 rounded text-text-muted hover:text-text-secondary hover:bg-black/5 transition-colors"
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

      {canDelete && (
        <DeleteBlockConfirmModal
          visible={confirmDeleteOpen}
          blockTitle={group.title}
          taskCount={group.items.length}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDeleteOpen(false)}
        />
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
  const [isDragging, setIsDragging] = useState(false)

  const canNavigate = date !== null
  const handleNavigate = () => {
    if (!date) return
    if (blockInstanceId) {
      navigate(`/day/${date}?block=${blockInstanceId}`)
    } else {
      navigate(`/day/${date}`)
    }
  }

  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    e.dataTransfer.setData(
      'application/x-bloc-task',
      JSON.stringify({ storeKey, taskId: task.id })
    )
    e.dataTransfer.effectAllowed = 'move'
    setIsDragging(true)
  }

  function handleDragEnd() {
    setIsDragging(false)
  }

  return (
    <div>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className={`group flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-bg-hover transition-colors cursor-grab active:cursor-grabbing ${
          isDragging ? 'opacity-40' : ''
        }`}
      >
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
