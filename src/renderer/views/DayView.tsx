import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { format, parseISO, addDays, subDays } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useTaskStore, type Task } from '../stores/taskStore'
import { useClipboardStore } from '../stores/clipboardStore'
import TaskEditor from '../components/TaskEditor'
import DistractionSidebar from '../components/DistractionSidebar'
import PomodoroTimer from '../components/PomodoroTimer'
import { loadDayFromICloud, watchDate } from '../services/syncService'

function DistractionPanel({ date }: { date: string }) {
  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 h-[50px]" />
      <div className="flex-1 min-h-0">
        <DistractionSidebar date={date} showHeader />
      </div>
    </div>
  )
}

function DistractionPanelNarrow({ date }: { date: string }) {
  return <DistractionSidebar date={date} showHeader={false} />
}

const EMPTY_TASKS: Task[] = []
const MIN_PANEL_PCT = 15
const DIVIDER_STORAGE_KEY = 'bloc-divider-pct'
const NARROW_BREAKPOINT = 640

interface DayViewProps {
  date?: string
  embedded?: boolean
  onToast?: (message: string, action?: { label: string; onClick: () => void }) => void
}

export default function DayView(props: DayViewProps) {
  const params = useParams<{ date: string }>()
  const date = props.date || params.date
  const embedded = props.embedded || false
  const onToast = props.onToast
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  const [leftPct, setLeftPct] = useState(() => {
    const stored = localStorage.getItem(DIVIDER_STORAGE_KEY)
    return stored ? Number(stored) : 75
  })
  const [isDragging, setIsDragging] = useState(false)

  // Narrow viewport detection
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < NARROW_BREAKPOINT)
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < NARROW_BREAKPOINT)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Tabbed layout state for narrow view
  const [activeTab, setActiveTab] = useState<'tasks' | 'distractions'>('tasks')

  const allTasks = useTaskStore((s) => s.tasks)
  const tasks = allTasks[date!] ?? EMPTY_TASKS

  const allDistractions = useTaskStore((s) => s.distractions)
  const distractionCount = (allDistractions[date!] || []).filter((d) => d.status === 'pending').length

  // Load from iCloud and start watching when date changes
  // Skip for embedded mode — composite keys (date__block__id) aren't real dates;
  // the parent TimelineView handles iCloud sync for the actual date.
  useEffect(() => {
    if (!date || embedded) return
    loadDayFromICloud(date)
    watchDate(date)
  }, [date, embedded])

  // Escape to go back (only in standalone mode — timeline handles its own escape)
  // If clipboard is active, let App.tsx handle Escape to clear clipboard instead
  useEffect(() => {
    if (embedded) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (useClipboardStore.getState().task) return
        navigate('/')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate, embedded])

  // Alt+Left/Right for day navigation (standalone mode only)
  useEffect(() => {
    if (embedded) return
    function handleKeyDown(e: KeyboardEvent) {
      if (!date) return
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        const prev = format(subDays(parseISO(date), 1), 'yyyy-MM-dd')
        navigate(`/day/${prev}`)
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        const next = format(addDays(parseISO(date), 1), 'yyyy-MM-dd')
        navigate(`/day/${next}`)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [date, navigate, embedded])

  // Resizable divider drag logic
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    function onMouseMove(e: MouseEvent) {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      let pct = (x / rect.width) * 100
      pct = Math.max(MIN_PANEL_PCT, Math.min(100 - MIN_PANEL_PCT, pct))
      setLeftPct(pct)
    }

    function onMouseUp() {
      setIsDragging(false)
      localStorage.setItem(DIVIDER_STORAGE_KEY, String(leftPct))
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isDragging, leftPct])

  // Keyboard divider adjustment
  const handleDividerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setLeftPct((p) => {
        const next = Math.max(MIN_PANEL_PCT, p - 5)
        localStorage.setItem(DIVIDER_STORAGE_KEY, String(next))
        return next
      })
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      setLeftPct((p) => {
        const next = Math.min(100 - MIN_PANEL_PCT, p + 5)
        localStorage.setItem(DIVIDER_STORAGE_KEY, String(next))
        return next
      })
    }
  }, [])

  const goToPrevDay = useCallback(() => {
    if (!date) return
    navigate(`/day/${format(subDays(parseISO(date), 1), 'yyyy-MM-dd')}`)
  }, [date, navigate])

  const goToNextDay = useCallback(() => {
    if (!date) return
    navigate(`/day/${format(addDays(parseISO(date), 1), 'yyyy-MM-dd')}`)
  }, [date, navigate])

  // ─── Embedded mode: tasks only (distractions live on the timeline sidebar) ──
  // Must return before date formatting — composite keys (date__block__id) aren't valid dates.
  if (embedded) {
    return (
      <div ref={containerRef} className="h-full flex flex-col bg-bg-primary overflow-hidden">
        <TaskEditor date={date!} tasks={tasks} onToast={onToast} />
      </div>
    )
  }

  // Date formatting — shorter on narrow
  const rawDate = date
    ? isNarrow
      ? format(parseISO(date), "EEE, d MMM", { locale: pt })
      : format(parseISO(date), "EEEE, d 'de' MMMM yyyy", { locale: pt })
    : ''
  const formattedDate = rawDate.charAt(0).toUpperCase() + rawDate.slice(1)

  // ─── Narrow layout (< 640px): tabbed view ────────────────────────
  if (isNarrow) {
    return (
      <div ref={containerRef} className="h-full flex flex-col bg-bg-primary">
        {/* Titlebar */}
        <div className="titlebar-drag shrink-0 flex items-end justify-between px-3 pt-[38px] pb-2">
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/')}
              aria-label="Voltar"
              className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors"
            >
              <ArrowLeft size={18} />
            </motion.button>
          </div>
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <PomodoroTimer />
          </div>
        </div>

        {/* Date header with nav */}
        <div className="shrink-0 px-3 pt-1 pb-1 flex items-center gap-1">
          <button
            onClick={goToPrevDay}
            aria-label="Dia anterior"
            title="Alt+←"
            className="p-1 rounded hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary"
          >
            <ChevronLeft size={14} />
          </button>
          <h2 className="text-sm text-text-secondary font-medium">{formattedDate}</h2>
          <button
            onClick={goToNextDay}
            aria-label="Dia seguinte"
            title="Alt+→"
            className="p-1 rounded hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="shrink-0 px-3 pt-1 pb-2 flex gap-1">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'tasks'
                ? 'bg-bg-secondary text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Tarefas
            {tasks.length > 0 && (
              <span className="ml-1.5 text-xs opacity-60">{tasks.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('distractions')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'distractions'
                ? 'bg-bg-secondary text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Distrações
            {distractionCount > 0 && (
              <span className="ml-1.5 text-xs font-medium text-distraction">{distractionCount}</span>
            )}
          </button>
        </div>

        {/* Active panel — full width */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'tasks' ? (
            <TaskEditor date={date!} tasks={tasks} onToast={onToast} />
          ) : (
            <DistractionPanelNarrow date={date!} />
          )}
        </div>
      </div>
    )
  }

  // ─── Wide layout (≥ 640px): split panels with divider ────────────
  return (
    <div
      ref={containerRef}
      className="h-full flex bg-bg-primary"
      style={{ cursor: isDragging ? 'col-resize' : undefined }}
    >
      {/* Left: titlebar + tasks */}
      <div style={{ width: `${leftPct}%` }} className="flex flex-col overflow-hidden">
        <div className="titlebar-drag shrink-0 flex items-end justify-between pl-5 pr-6 pt-[50px] pb-2">
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/')}
              aria-label="Voltar"
              className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors"
            >
              <ArrowLeft size={18} />
            </motion.button>
          </div>
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <PomodoroTimer />
          </div>
        </div>

        {/* Date header with nav */}
        <div className="shrink-0 pl-5 pr-5 pt-1 pb-1 flex items-center gap-1">
          <button
            onClick={goToPrevDay}
            aria-label="Dia anterior"
            title="Alt+←"
            className="p-1 rounded hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary"
          >
            <ChevronLeft size={14} />
          </button>
          <h2 className="text-sm text-text-secondary font-medium">{formattedDate}</h2>
          <button
            onClick={goToNextDay}
            aria-label="Dia seguinte"
            title="Alt+→"
            className="p-1 rounded hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Tasks */}
        <div className="flex-1 overflow-hidden">
          <TaskEditor date={date!} tasks={tasks} onToast={onToast} />
        </div>
      </div>

      {/* Resizable divider */}
      <div
        onMouseDown={handleMouseDown}
        onKeyDown={handleDividerKeyDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar painéis"
        tabIndex={0}
        className="shrink-0 w-[5px] relative group cursor-col-resize flex items-center justify-center"
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border/0 group-hover:bg-border/40 transition-colors" />
        {isDragging && (
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px panel-divider-active" />
        )}
        <span className="text-text-muted/40 group-hover:text-text-muted/70 transition-colors text-xs select-none" aria-hidden="true">
          •••
        </span>
      </div>

      {/* Distractions panel — full height */}
      <div
        style={{ width: `${100 - leftPct}%` }}
        className="overflow-hidden glass-panel"
      >
        <DistractionPanel date={date!} />
      </div>
    </div>
  )
}
