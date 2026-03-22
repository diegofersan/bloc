import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardList, Waves, Zap } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, parseISO, addDays, subDays } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useTimeBlockStore, type TimeBlock } from '../stores/timeBlockStore'
import { useTaskStore } from '../stores/taskStore'
import DeferBlockModal from '../components/DeferBlockModal'
import { usePomodoroStore } from '../stores/pomodoroStore'
import TimelineGrid from '../components/TimelineGrid'
import DistractionItem from '../components/DistractionItem'
import DayView from './DayView'
import DailyStandupModal from '../components/DailyStandupModal'
import FlowTimer from '../components/FlowTimer'
import FlowQueueView from '../components/FlowQueueView'
import { useFlowStore } from '../stores/flowStore'
import PendingTasksPanel from '../components/PendingTasksPanel'
import HourglassIndicator from '../components/HourglassIndicator'
import { loadDayFromICloud, watchDate } from '../services/syncService'
import { syncDate } from '../services/googleCalendarSync'

type ViewMode = 'timeline' | 'detail'

const EMPTY_BLOCKS: TimeBlock[] = []

function formatTimeHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parseTimeHHMM(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

function DetailBlockHeader({
  block,
  onUpdate,
  isNarrow
}: {
  block: TimeBlock
  onUpdate: (updates: Partial<Pick<TimeBlock, 'startTime' | 'endTime' | 'title'>>) => void
  isNarrow: boolean
}) {
  const [title, setTitle] = useState(block.title)
  const [startStr, setStartStr] = useState(formatTimeHHMM(block.startTime))
  const [endStr, setEndStr] = useState(formatTimeHHMM(block.endTime))

  // Sync local state when block changes from outside (drag, etc.)
  useEffect(() => {
    setTitle(block.title)
    setStartStr(formatTimeHHMM(block.startTime))
    setEndStr(formatTimeHHMM(block.endTime))
  }, [block.title, block.startTime, block.endTime])

  const commitTitle = useCallback(() => {
    const trimmed = title.trim()
    if (trimmed !== block.title) {
      onUpdate({ title: trimmed || 'Sem título' })
    }
  }, [title, block.title, onUpdate])

  const commitStart = useCallback(() => {
    const parsed = parseTimeHHMM(startStr)
    if (parsed !== null && parsed !== block.startTime && parsed < block.endTime) {
      onUpdate({ startTime: parsed })
    } else {
      setStartStr(formatTimeHHMM(block.startTime))
    }
  }, [startStr, block.startTime, block.endTime, onUpdate])

  const commitEnd = useCallback(() => {
    const parsed = parseTimeHHMM(endStr)
    if (parsed !== null && parsed !== block.endTime && parsed > block.startTime) {
      onUpdate({ endTime: parsed })
    } else {
      setEndStr(formatTimeHHMM(block.endTime))
    }
  }, [endStr, block.startTime, block.endTime, onUpdate])

  return (
    <div className={`shrink-0 ${isNarrow ? 'px-3' : 'pl-5 pr-5'} pb-2 flex items-center gap-3`}>
      {/* Editable title */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        placeholder="Sem título"
        className="flex-1 min-w-0 text-sm font-medium bg-transparent outline-none text-text-primary placeholder:text-text-muted/50 border-b border-transparent transition-colors"
      />

      {/* Hourglass + editable time range */}
      <div className="flex items-center gap-2 shrink-0">
        <HourglassIndicator startTime={block.startTime} endTime={block.endTime} />
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={startStr}
            onChange={(e) => setStartStr(e.target.value)}
            onBlur={commitStart}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className="w-[52px] text-xs text-text-secondary font-medium tabular-nums text-center bg-transparent outline-none border-b border-transparent transition-colors rounded-none"
            maxLength={5}
          />
          <span className="text-xs text-text-muted">–</span>
          <input
            type="text"
            value={endStr}
            onChange={(e) => setEndStr(e.target.value)}
            onBlur={commitEnd}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className="w-[52px] text-xs text-text-secondary font-medium tabular-nums text-center bg-transparent outline-none border-b border-transparent transition-colors rounded-none"
            maxLength={5}
          />
        </div>
      </div>
    </div>
  )
}

function FlowLayout({ date, isNarrow }: { date: string; isNarrow: boolean }) {
  const [sidebarWidth, setSidebarWidth] = useState(192)
  const isDragging = useRef(false)
  const distractionRef = useRef<HTMLInputElement>(null)
  const [distractionText, setDistractionText] = useState('')

  const distractions = useTaskStore((s) => s.distractions[date] || [])
  const addDistraction = useTaskStore((s) => s.addDistraction)
  const pendingDistractions = distractions.filter((d) => d.status === 'pending')

  const handleAddDistraction = useCallback(() => {
    const trimmed = distractionText.trim()
    if (!trimmed) return
    addDistraction(date, trimmed)
    setDistractionText('')
  }, [distractionText, date, addDistraction])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    const startX = e.clientX
    const startWidth = sidebarWidth

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const delta = startX - ev.clientX
      setSidebarWidth(Math.max(120, Math.min(400, startWidth + delta)))
    }
    const onMouseUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [sidebarWidth])

  return (
    <div className="h-full flex bg-bg-primary">
      {/* Left: titlebar + timer + queue */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className={`titlebar-drag shrink-0 ${isNarrow ? 'px-3 pt-[38px]' : 'pl-5 pr-5 pt-[50px]'} pb-2`}>
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <FlowTimer />
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <FlowQueueView date={date} />
        </div>
      </div>

      {/* Resize handle */}
      <div
        className="shrink-0 w-1 cursor-col-resize hover:bg-violet-500/20 active:bg-violet-500/30 transition-colors"
        onMouseDown={handleMouseDown}
      />

      {/* Right: Distractions sidebar — full height */}
      <div className="shrink-0 flex flex-col border-l border-border/30" style={{ width: sidebarWidth }}>
        <div className={`titlebar-drag shrink-0 ${isNarrow ? 'px-3 pt-[38px]' : 'px-3 pt-[50px]'} pb-2`}>
          <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
            Distrações
          </span>
        </div>

        {/* Distraction list */}
        <div className="flex-1 overflow-y-auto px-3 pb-2">
          {pendingDistractions.length === 0 && (
            <p className="text-[11px] text-text-muted/50 py-2">Nenhuma ainda</p>
          )}
          {pendingDistractions.map((d) => (
            <div key={d.id} className="py-1">
              <span className="text-[11px] text-text-muted leading-tight">{d.text}</span>
            </div>
          ))}
        </div>

        {/* Distraction input */}
        <div className="shrink-0 px-3 pb-3 pt-2">
          <div className="flex items-center gap-1.5">
            <Zap size={10} className="shrink-0 text-distraction" />
            <input
              ref={distractionRef}
              type="text"
              value={distractionText}
              onChange={(e) => setDistractionText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddDistraction() }}
              placeholder="Anotar..."
              className="flex-1 text-[11px] bg-bg-secondary/60 border border-border/40 rounded-md px-2 py-1 text-text-primary placeholder:text-text-muted outline-none focus:border-distraction/50 transition-colors"
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TimelineView() {
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const initialBlockId = searchParams.get('block')
  const [viewMode, setViewMode] = useState<ViewMode>(initialBlockId ? 'detail' : 'timeline')
  const viewModeRef = useRef<ViewMode>(initialBlockId ? 'detail' : 'timeline')
  const [activeBlockId, setActiveBlockId] = useState<string | null>(initialBlockId)

  // Clear the ?block= param after using it so back navigation stays clean
  useEffect(() => {
    if (initialBlockId) {
      setSearchParams({}, { replace: true })
    }
  }, [])
  // Sync active block to store so StealthyView can use it
  const setStealthyBlockId = usePomodoroStore((s) => s.setStealthyBlockId)
  useEffect(() => {
    if (viewMode === 'detail' && activeBlockId) {
      setStealthyBlockId(activeBlockId)
    } else {
      setStealthyBlockId(null)
    }
  }, [viewMode, activeBlockId, setStealthyBlockId])

  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  const allBlocks = useTimeBlockStore((s) => s.blocks)
  const blocks = allBlocks[date!] ?? EMPTY_BLOCKS
  const addBlock = useTimeBlockStore((s) => s.addBlock)
  const updateBlock = useTimeBlockStore((s) => s.updateBlock)
  const removeBlock = useTimeBlockStore((s) => s.removeBlock)
  const deferBlock = useTimeBlockStore((s) => s.deferBlock)
  const moveBlockTasks = useTaskStore((s) => s.moveBlockTasks)
  const [deferringBlock, setDeferringBlock] = useState<TimeBlock | null>(null)

  // Flow (Go With The Flow) state
  const flowIsActive = useFlowStore((s) => s.isActive)
  const flowActivate = useFlowStore((s) => s.activate)
  const showFlowButton = !flowIsActive && !!activeBlockId

  // Distractions
  const allDistractions = useTaskStore((s) => s.distractions)
  const addDistraction = useTaskStore((s) => s.addDistraction)
  const convertToTask = useTaskStore((s) => s.convertToTask)
  const distractions = (allDistractions[date!] || []).filter((d) => d.status === 'pending')
  const [distractionInput, setDistractionInput] = useState('')

  // Pending tasks count for badges
  const allStoreTasks = useTaskStore((s) => s.tasks)
  const allTaskRefs = useTaskStore((s) => s.taskRefs)
  const pendingCount = useMemo(() => {
    if (!date) return 0
    let count = 0
    const linkedIds = new Set((allTaskRefs[date] || []).map((r) => r.originTaskId))
    for (const [d, taskList] of Object.entries(allStoreTasks)) {
      // Extract base date from composite keys (e.g. "2026-03-10__block__uuid")
      const blockMatch = d.match(/^(.+)__block__(.+)$/)
      const baseDate = blockMatch ? blockMatch[1] : d
      // Skip tasks from the current day
      if (baseDate === date) continue
      for (const task of taskList) {
        if (!task.completed && !linkedIds.has(task.id)) count++
      }
    }
    return count
  }, [allStoreTasks, allTaskRefs, date])

  // Split panel divider
  const containerRef = useRef<HTMLDivElement>(null)
  const DIVIDER_KEY = 'bloc-timeline-divider-pct'
  const [leftPct, setLeftPct] = useState(() => {
    const stored = localStorage.getItem(DIVIDER_KEY)
    return stored ? Number(stored) : 75
  })
  const [isDividerDragging, setIsDividerDragging] = useState(false)

  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 640)
  const [showStandup, setShowStandup] = useState(false)
  const [activeTab, setActiveTab] = useState<'timeline' | 'pending' | 'distractions'>('timeline')
  const [detailRightTab, setDetailRightTab] = useState<'pending' | 'distractions'>('pending')
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Load from iCloud first, then sync Google Calendar when date changes
  useEffect(() => {
    if (!date) return
    async function load() {
      await loadDayFromICloud(date!)
      watchDate(date!)
      await syncDate(date!)
    }
    load()
  }, [date])

  // Back: detail → timeline, timeline → calendar
  // Uses ref so a fast double-click reads the already-updated value
  const handleBack = useCallback(() => {
    // Block navigation during active flow
    if (flowIsActive) return
    if (viewModeRef.current === 'detail') {
      viewModeRef.current = 'timeline'
      setViewMode('timeline')
      setActiveBlockId(null)
    } else {
      navigate('/')
    }
  }, [navigate, flowIsActive])

  // Keyboard: Escape to go back
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (editingBlockId) {
          commitTitle()
          return
        }
        handleBack()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editingBlockId, handleBack])

  // Alt+Left/Right for day navigation (blocked during flow)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!date || flowIsActive) return
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

  // Focus title input when editing
  useEffect(() => {
    if (editingBlockId && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [editingBlockId])

  const handleBlockClick = useCallback((block: TimeBlock) => {
    setActiveBlockId(block.id)
    viewModeRef.current = 'detail'
    setViewMode('detail')
  }, [])

  const handleCreateBlock = useCallback(
    (startTime: number, endTime: number) => {
      if (!date) return
      const id = addBlock(date, {
        date,
        startTime,
        endTime,
        title: '',
        color: 'indigo'
      })
      setEditingBlockId(id)
      setEditTitle('')
    },
    [date, addBlock]
  )

  const handleUpdate = useCallback(
    (blockId: string, updates: Partial<Pick<TimeBlock, 'startTime' | 'endTime' | 'title' | 'color'>>) => {
      if (!date) return
      updateBlock(date, blockId, updates)
    },
    [date, updateBlock]
  )

  const handleRemove = useCallback(
    (blockId: string) => {
      if (!date) return
      removeBlock(date, blockId)
    },
    [date, removeBlock]
  )

  const handleDefer = useCallback(
    (blockId: string) => {
      const b = blocks.find((b) => b.id === blockId)
      if (b) setDeferringBlock(b)
    },
    [blocks]
  )

  const commitTitle = useCallback(() => {
    if (editingBlockId && date) {
      const title = editTitle.trim() || 'Sem título'
      updateBlock(date, editingBlockId, { title })
      setEditingBlockId(null)
      setEditTitle('')
    }
  }, [editingBlockId, editTitle, date, updateBlock])

  // Divider drag
  const handleDividerDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDividerDragging(true)
  }, [])

  useEffect(() => {
    if (!isDividerDragging) return
    function onMouseMove(e: MouseEvent) {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      let pct = (x / rect.width) * 100
      pct = Math.max(30, Math.min(85, pct))
      setLeftPct(pct)
    }
    function onMouseUp() {
      setIsDividerDragging(false)
      localStorage.setItem(DIVIDER_KEY, String(leftPct))
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isDividerDragging, leftPct])

  // Date formatting
  const rawDate = date
    ? isNarrow
      ? format(parseISO(date), 'EEE, d MMM', { locale: pt })
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

  // ─── Flow mode: task queue replaces everything when GWTF active ─────────
  if (flowIsActive && date) {
    return <FlowLayout date={date} isNarrow={isNarrow} />
  }

  // ─── Detail mode: show embedded DayView + distractions ────────────────────
  if (viewMode === 'detail' && activeBlockId) {
    const activeBlock = blocks.find((b) => b.id === activeBlockId)

    // Narrow: tabbed layout (Tarefas / Distrações)
    if (isNarrow) {
      return (
        <div className="h-full flex flex-col bg-bg-primary">
          <div className="titlebar-drag shrink-0 flex items-end justify-between px-3 pt-[38px] pb-2">
            <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleBack}
                aria-label="Voltar à timeline"
                className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors"
              >
                <ArrowLeft size={18} />
              </motion.button>
            </div>
            <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              {showFlowButton && date ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => flowActivate(date, activeBlockId!)}
                aria-label="Fluir"
                title="Go With The Flow"
                className="p-1.5 rounded-lg text-violet-400 hover:text-violet-500 hover:bg-bg-hover transition-colors"
              >
                <Waves size={16} />
              </motion.button>
            ) : null}
            </div>
          </div>

          {activeBlock && (
            <DetailBlockHeader block={activeBlock} onUpdate={(updates) => handleUpdate(activeBlock.id, updates)} isNarrow />
          )}

          {/* Tab bar */}
          <div className="shrink-0 px-3 pt-1 pb-2 flex gap-1">
            <button
              onClick={() => setActiveTab('timeline')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'timeline' ? 'bg-bg-secondary text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Tarefas
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'pending' ? 'bg-bg-secondary text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Pendentes
              {pendingCount > 0 && (
                <span className="ml-1.5 text-xs font-medium text-amber-600">{pendingCount}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('distractions')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'distractions' ? 'bg-bg-secondary text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Distrações
              {distractions.length > 0 && (
                <span className="ml-1.5 text-xs font-medium text-distraction">{distractions.length}</span>
              )}
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {activeTab === 'timeline' ? (
              <DayView date={`${date!}__block__${activeBlockId}`} embedded />
            ) : activeTab === 'pending' ? (
              <PendingTasksPanel currentDate={date!} />
            ) : (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="shrink-0 px-3 pt-2 pb-3">
                  <input type="text" value={distractionInput} onChange={(e) => setDistractionInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && distractionInput.trim()) { addDistraction(date!, distractionInput.trim()); setDistractionInput('') } }} placeholder="Anotar distração..." className="w-full rounded-lg bg-transparent px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:bg-bg-secondary/60 transition-colors" />
                </div>
                <div className="flex-1 overflow-y-auto px-3 pb-6">
                  {distractions.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-text-muted/50 text-xs text-center leading-relaxed">Capture pensamentos aqui...<br /><span className="text-xs">⌘⇧D para captura rápida</span></p>
                    </div>
                  ) : (
                    <AnimatePresence>
                      {distractions.map((d) => (
                        <DistractionItem key={d.id} distraction={d} date={date!} onConvert={(id) => convertToTask(date!, id, date!)} />
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )
    }

    // Wide: split panel (tasks left + distractions right)
    return (
      <div ref={containerRef} className="h-full flex flex-col bg-bg-primary" style={{ cursor: isDividerDragging ? 'col-resize' : undefined }}>
        <div className="titlebar-drag shrink-0 flex items-end justify-between pl-5 pr-6 pt-[50px] pb-2">
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleBack}
              aria-label="Voltar à timeline"
              className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors"
            >
              <ArrowLeft size={18} />
            </motion.button>
          </div>
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {showFlowButton && date ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => flowActivate(date, activeBlockId!)}
                aria-label="Fluir"
                title="Go With The Flow"
                className="p-1.5 rounded-lg text-violet-400 hover:text-violet-500 hover:bg-bg-hover transition-colors"
              >
                <Waves size={16} />
              </motion.button>
            ) : null}
          </div>
        </div>

        {activeBlock && (
          <DetailBlockHeader block={activeBlock} onUpdate={(updates) => handleUpdate(activeBlock.id, updates)} isNarrow={false} />
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* Left: block tasks */}
          <div style={{ width: `${leftPct}%` }} className="overflow-hidden">
            <DayView date={`${date!}__block__${activeBlockId}`} embedded />
          </div>

          {/* Divider */}
          <div onMouseDown={handleDividerDown} className="shrink-0 w-[5px] relative group cursor-col-resize flex items-center justify-center">
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border/0 group-hover:bg-border/40 transition-colors" />
            {isDividerDragging && (
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px panel-divider-active" />
            )}
            <span className="text-text-muted/40 group-hover:text-text-muted/70 transition-colors text-xs select-none" aria-hidden="true">•••</span>
          </div>

          {/* Right: pending tasks + distractions */}
          <div style={{ width: `${100 - leftPct}%` }} className="overflow-hidden glass-panel flex flex-col">
            {/* Tab bar */}
            <div className="shrink-0 px-4 pt-3 pb-2 flex gap-1">
              <button
                onClick={() => setDetailRightTab('pending')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  detailRightTab === 'pending' ? 'bg-bg-secondary text-text-primary' : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                Pendentes
                {pendingCount > 0 && (
                  <span className="ml-1.5 text-xs font-medium text-amber-600">{pendingCount}</span>
                )}
              </button>
              <button
                onClick={() => setDetailRightTab('distractions')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  detailRightTab === 'distractions' ? 'bg-bg-secondary text-text-primary' : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                Distrações
                {distractions.length > 0 && (
                  <span className="ml-1.5 text-xs font-medium text-distraction">{distractions.length}</span>
                )}
              </button>
            </div>

            {detailRightTab === 'pending' ? (
              <PendingTasksPanel currentDate={date!} />
            ) : (
              <>
                <div className="shrink-0 px-5 pt-2 pb-4">
                  <input
                    type="text"
                    value={distractionInput}
                    onChange={(e) => setDistractionInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && distractionInput.trim()) {
                        addDistraction(date!, distractionInput.trim())
                        setDistractionInput('')
                      }
                    }}
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
                        <DistractionItem key={d.id} distraction={d} date={date!} onConvert={(id) => convertToTask(date!, id, date!)} />
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── Timeline mode: narrow (< 640px) — tabbed ──────────────
  if (isNarrow) {
    return (
      <div className="h-full flex flex-col bg-bg-primary">
        {/* Titlebar */}
        <div className="titlebar-drag shrink-0 flex items-end justify-between px-3 pt-[38px] pb-2">
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleBack}
              aria-label="Voltar"
              className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors"
            >
              <ArrowLeft size={18} />
            </motion.button>
          </div>
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowStandup(true)}
              aria-label="Daily Standup"
              className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors"
            >
              <ClipboardList size={18} />
            </motion.button>
          </div>
        </div>

        {/* Date header */}
        <div className="shrink-0 px-3 pt-1 pb-1 flex items-center gap-1">
          <button onClick={goToPrevDay} aria-label="Dia anterior" className="p-1 rounded hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary">
            <ChevronLeft size={14} />
          </button>
          <h2 className="text-sm text-text-secondary font-medium">{formattedDate}</h2>
          <button onClick={goToNextDay} aria-label="Dia seguinte" className="p-1 rounded hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary">
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="shrink-0 px-3 pt-1 pb-2 flex gap-1">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'timeline' ? 'bg-bg-secondary text-text-primary' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Timeline
          </button>
          <button
            onClick={() => setActiveTab('distractions')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'distractions' ? 'bg-bg-secondary text-text-primary' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Distrações
            {distractions.length > 0 && (
              <span className="ml-1.5 text-xs font-medium text-distraction">{distractions.length}</span>
            )}
          </button>
        </div>

        {/* Inline title editor */}
        <AnimatePresence>
          {editingBlockId && activeTab === 'timeline' && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="shrink-0 px-3 pb-2">
              <div className="flex items-center gap-2 rounded-lg bg-bg-secondary border border-accent/30 px-3 py-2">
                <input ref={titleInputRef} type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') commitTitle() }} onBlur={commitTitle} placeholder="Nome do bloco..." className="flex-1 text-sm bg-transparent outline-none text-text-primary placeholder:text-text-muted/50" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active tab content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'timeline' ? (
            <TimelineGrid blocks={blocks} onUpdate={handleUpdate} onRemove={handleRemove} onDefer={handleDefer} onBlockClick={handleBlockClick} onCreateBlock={handleCreateBlock} />
          ) : (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="shrink-0 px-3 pt-2 pb-3">
                <input type="text" value={distractionInput} onChange={(e) => setDistractionInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && distractionInput.trim()) { addDistraction(date!, distractionInput.trim()); setDistractionInput('') } }} placeholder="Anotar distração..." className="w-full rounded-lg bg-transparent px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:bg-bg-secondary/60 transition-colors" />
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-6">
                {distractions.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-text-muted/50 text-xs text-center leading-relaxed">Capture pensamentos aqui...<br /><span className="text-xs">⌘⇧D para captura rápida</span></p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {distractions.map((d) => (
                      <DistractionItem key={d.id} distraction={d} date={date!} onConvert={(id) => convertToTask(date!, id, date!)} />
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </div>
          )}
        </div>
        <DailyStandupModal visible={showStandup} onClose={() => setShowStandup(false)} />
        <DeferBlockModal
          isOpen={!!deferringBlock}
          onClose={() => setDeferringBlock(null)}
          blockDate={deferringBlock?.date ?? ''}
          onSelectDate={(toDate) => {
            if (deferringBlock) {
              deferBlock(deferringBlock.date, deferringBlock.id, toDate)
              moveBlockTasks(deferringBlock.date, deferringBlock.id, toDate)
              setDeferringBlock(null)
            }
          }}
        />
      </div>
    )
  }

  // ─── Timeline mode: wide (≥ 640px) — split panel ──────────
  return (
    <div ref={containerRef} className="h-full flex flex-col bg-bg-primary" style={{ cursor: isDividerDragging ? 'col-resize' : undefined }}>
      {/* Titlebar */}
      <div className="titlebar-drag shrink-0 flex items-end justify-between pl-5 pr-6 pt-[50px] pb-2">
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleBack}
            aria-label="Voltar"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors"
          >
            <ArrowLeft size={18} />
          </motion.button>
        </div>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowStandup(true)}
            aria-label="Daily Standup"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors"
          >
            <ClipboardList size={18} />
          </motion.button>
        </div>
      </div>

      {/* Date header */}
      <div className="shrink-0 pl-5 pr-5 pt-1 pb-2 flex items-center gap-1">
        <button onClick={goToPrevDay} aria-label="Dia anterior" title="Alt+←" className="p-1 rounded hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary">
          <ChevronLeft size={14} />
        </button>
        <h2 className="text-sm text-text-secondary font-medium">{formattedDate}</h2>
        <button onClick={goToNextDay} aria-label="Dia seguinte" title="Alt+→" className="p-1 rounded hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary">
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Inline title editor */}
      <AnimatePresence>
        {editingBlockId && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="shrink-0 pl-5 pr-5 pb-2">
            <div className="flex items-center gap-2 rounded-lg bg-bg-secondary border border-accent/30 px-3 py-2">
              <input ref={titleInputRef} type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') commitTitle() }} onBlur={commitTitle} placeholder="Nome do bloco..." className="flex-1 text-sm bg-transparent outline-none text-text-primary placeholder:text-text-muted/50" />
              <span className="text-[10px] text-text-muted">Enter para confirmar</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Split: timeline + distractions */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: timeline grid */}
        <div style={{ width: `${leftPct}%` }} className="overflow-hidden">
          <TimelineGrid blocks={blocks} onUpdate={handleUpdate} onRemove={handleRemove} onDefer={handleDefer} onBlockClick={handleBlockClick} onCreateBlock={handleCreateBlock} />
        </div>

        {/* Divider */}
        <div
          onMouseDown={handleDividerDown}
          className="shrink-0 w-[5px] relative group cursor-col-resize flex items-center justify-center"
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border/0 group-hover:bg-border/40 transition-colors" />
          {isDividerDragging && (
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px panel-divider-active" />
          )}
          <span className="text-text-muted/40 group-hover:text-text-muted/70 transition-colors text-xs select-none" aria-hidden="true">•••</span>
        </div>

        {/* Right: distractions */}
        <div style={{ width: `${100 - leftPct}%` }} className="overflow-hidden glass-panel flex flex-col">
          <div className="shrink-0 px-5 pt-4 pb-4">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xs font-medium text-text-muted/70 uppercase tracking-wider">Distrações</h2>
              {distractions.length > 0 && (
                <span className="text-xs font-medium text-distraction bg-distraction/15 rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1.5">{distractions.length}</span>
              )}
            </div>
            <input
              type="text"
              value={distractionInput}
              onChange={(e) => setDistractionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && distractionInput.trim()) {
                  addDistraction(date!, distractionInput.trim())
                  setDistractionInput('')
                }
              }}
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
                  <DistractionItem key={d.id} distraction={d} date={date!} onConvert={(id) => convertToTask(date!, id, date!)} />
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
      <DailyStandupModal visible={showStandup} onClose={() => setShowStandup(false)} />
      <DeferBlockModal
        isOpen={!!deferringBlock}
        onClose={() => setDeferringBlock(null)}
        blockDate={deferringBlock?.date ?? ''}
        onSelectDate={(toDate) => {
          if (deferringBlock) {
            deferBlock(deferringBlock.date, deferringBlock.id, toDate)
            moveBlockTasks(deferringBlock.date, deferringBlock.id, toDate)
            setDeferringBlock(null)
          }
        }}
      />
    </div>
  )
}
