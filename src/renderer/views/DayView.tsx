import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, parseISO, addDays, subDays } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useTaskStore, type Task } from '../stores/taskStore'
import TaskEditor from '../components/TaskEditor'
import DistractionItem from '../components/DistractionItem'
import PomodoroTimer from '../components/PomodoroTimer'

function DistractionPanel({ date }: { date: string }) {
  const distractionInputRef = useRef<HTMLInputElement>(null)
  const [inputValue, setInputValue] = useState('')
  const allDistractions = useTaskStore((s) => s.distractions)
  const addDistraction = useTaskStore((s) => s.addDistraction)
  const convertToTask = useTaskStore((s) => s.convertToTask)

  const distractions = (allDistractions[date] || []).filter((d) => d.status === 'pending')

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && inputValue.trim()) {
      addDistraction(date, inputValue.trim())
      setInputValue('')
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-5 pt-[58px] pb-4">
        <div className="flex items-center gap-2 mb-5">
          <h2 className="text-xs font-medium text-text-muted/70 uppercase tracking-wider">
            Distrações
          </h2>
          {distractions.length > 0 && (
            <span className="text-xs font-medium text-distraction bg-distraction/15 rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1.5">
              {distractions.length}
            </span>
          )}
        </div>
        <input
          ref={distractionInputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Anotar distração..."
          className="w-full rounded-lg bg-transparent px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:bg-bg-secondary/60 transition-colors"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {distractions.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-text-muted/50 text-xs text-center leading-relaxed">
              Capture pensamentos aqui...<br />
              <span className="text-xs">⌘⇧D para captura rápida</span>
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {distractions.map((d) => (
              <DistractionItem
                key={d.id}
                distraction={d}
                date={date}
                onConvert={(id) => convertToTask(date, id, date)}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}

/** Narrow variant of DistractionPanel — no top padding/title (tab bar handles that) */
function DistractionPanelNarrow({ date }: { date: string }) {
  const [inputValue, setInputValue] = useState('')
  const allDistractions = useTaskStore((s) => s.distractions)
  const addDistraction = useTaskStore((s) => s.addDistraction)
  const convertToTask = useTaskStore((s) => s.convertToTask)

  const distractions = (allDistractions[date] || []).filter((d) => d.status === 'pending')

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && inputValue.trim()) {
      addDistraction(date, inputValue.trim())
      setInputValue('')
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-3 pt-2 pb-3">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Anotar distração..."
          className="w-full rounded-lg bg-transparent px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:bg-bg-secondary/60 transition-colors"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {distractions.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-text-muted/50 text-xs text-center leading-relaxed">
              Capture pensamentos aqui...<br />
              <span className="text-xs">⌘⇧D para captura rápida</span>
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {distractions.map((d) => (
              <DistractionItem
                key={d.id}
                distraction={d}
                date={date}
                onConvert={(id) => convertToTask(date, id, date)}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}

const EMPTY_TASKS: Task[] = []
const MIN_PANEL_PCT = 15
const DIVIDER_STORAGE_KEY = 'bloc-divider-pct'
const NARROW_BREAKPOINT = 640

export default function DayView() {
  const { date } = useParams<{ date: string }>()
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

  // Escape to go back
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        navigate('/')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  // Alt+Left/Right for day navigation
  useEffect(() => {
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
  }, [date, navigate])

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

  // Date formatting — shorter on narrow
  const rawDate = date
    ? isNarrow
      ? format(parseISO(date), "EEE, d MMM", { locale: pt })
      : format(parseISO(date), "EEEE, d 'de' MMMM yyyy", { locale: pt })
    : ''
  const formattedDate = rawDate.charAt(0).toUpperCase() + rawDate.slice(1)

  const goToPrevDay = useCallback(() => {
    if (!date) return
    navigate(`/day/${format(subDays(parseISO(date), 1), 'yyyy-MM-dd')}`)
  }, [date, navigate])

  const goToNextDay = useCallback(() => {
    if (!date) return
    navigate(`/day/${format(addDays(parseISO(date), 1), 'yyyy-MM-dd')}`)
  }, [date, navigate])

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
              onClick={() => navigate(-1)}
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
            <TaskEditor date={date!} tasks={tasks} />
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
        {/* Titlebar */}
        <div className="titlebar-drag shrink-0 flex items-end justify-between pl-5 pr-6 pt-[50px] pb-2">
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate(-1)}
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
          <TaskEditor date={date!} tasks={tasks} />
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
