import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardList, Waves, Play, Lock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, parseISO, addDays, subDays } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useTimeBlockStore, type TimeBlock } from '../stores/timeBlockStore'
import { useTaskStore } from '../stores/taskStore'
import DeferBlockModal from '../components/DeferBlockModal'
import { usePomodoroStore } from '../stores/pomodoroStore'
import TimelineGrid from '../components/TimelineGrid'
import DistractionSidebar from '../components/DistractionSidebar'
import DayView from './DayView'
import DailyStandupModal from '../components/DailyStandupModal'
import FlowTimer from '../components/FlowTimer'
import FlowQueueView from '../components/FlowQueueView'
import { useFlowStore } from '../stores/flowStore'
import PendingTasksPanel from '../components/PendingTasksPanel'
import HourglassIndicator from '../components/HourglassIndicator'
import Toast from '../components/Toast'
import { computeBlockFit } from '../utils/blockFit'
import { loadDayFromICloud, watchDate } from '../services/syncService'
import { syncDate } from '../services/googleCalendarSync'

type ViewMode = 'timeline' | 'detail'

const EMPTY_BLOCKS: TimeBlock[] = []
const EMPTY_DISTRACTIONS: import('../stores/taskStore').Distraction[] = []

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
  onUpdate: (updates: Partial<Pick<TimeBlock, 'startTime' | 'endTime' | 'title' | 'private'>>) => void
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
        <button
          type="button"
          onClick={() => onUpdate({ private: !block.private })}
          title={block.private ? 'Privado — outros vêem só "Ocupado" no Google Calendar' : 'Público — visível no Google Calendar'}
          aria-pressed={!!block.private}
          className={`p-1 rounded hover:bg-black/5 transition-colors ${
            block.private ? 'text-rose-500' : 'text-text-muted/40'
          }`}
        >
          <Lock size={14} />
        </button>
      </div>
    </div>
  )
}

function FlowLayout({ date, isNarrow }: { date: string; isNarrow: boolean }) {
  const flowStarted = useFlowStore((s) => s.started)
  const startFlow = useFlowStore((s) => s.start)
  const deactivate = useFlowStore((s) => s.deactivate)

  const FLOW_DIVIDER_KEY = 'bloc-flow-divider-pct'
  const containerRef = useRef<HTMLDivElement>(null)
  const [leftPct, setFlowLeftPct] = useState(() => {
    const stored = localStorage.getItem(FLOW_DIVIDER_KEY)
    return stored ? Number(stored) : 75
  })
  const [isDragging, setIsDragging] = useState(false)
  const [isStacked, setIsStacked] = useState(() => window.innerWidth < 800)

  useEffect(() => {
    const onResize = () => setIsStacked(window.innerWidth < 800)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const handleDividerDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return
    function onMouseMove(e: MouseEvent) {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      let pct: number
      if (isStacked) {
        const y = e.clientY - rect.top
        pct = (y / rect.height) * 100
      } else {
        const x = e.clientX - rect.left
        pct = (x / rect.width) * 100
      }
      pct = Math.max(30, Math.min(85, pct))
      setFlowLeftPct(pct)
    }
    function onMouseUp() {
      setIsDragging(false)
      localStorage.setItem(FLOW_DIVIDER_KEY, String(leftPct))
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isDragging, leftPct, isStacked])

  return (
    <div
      ref={containerRef}
      className={`h-full flex bg-bg-primary ${isStacked ? 'flex-col' : ''}`}
      style={{ cursor: isDragging ? (isStacked ? 'row-resize' : 'col-resize') : undefined }}
    >
      {/* Left/Top: titlebar + timer + queue */}
      <div
        style={isStacked ? { height: `${leftPct}%` } : { width: `${leftPct}%` }}
        className="flex flex-col overflow-hidden"
      >
        <div className={`titlebar-drag shrink-0 ${isNarrow ? 'px-3 pt-[38px]' : 'pl-5 pr-5 pt-[50px]'} pb-2`}>
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <FlowTimer />
          </div>
        </div>
        <div className={`shrink-0 ${isNarrow ? 'px-3' : 'pl-5 pr-5'} pt-1 pb-2 flex items-center justify-between`}>
          <h2 className="text-sm text-text-secondary font-medium">
            {format(parseISO(date), isNarrow ? 'EEE, d MMM' : "EEEE, d 'de' MMMM yyyy", { locale: pt }).replace(/^./, (c) => c.toUpperCase())}
          </h2>
          {!flowStarted && (
            <div className="flex items-center gap-2">
              <button
                onClick={deactivate}
                className="text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                Voltar
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={startFlow}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 transition-colors"
              >
                <Play size={12} />
                Go with the flow
              </motion.button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <FlowQueueView date={date} />
        </div>
      </div>

      {/* Divider */}
      <div
        onMouseDown={handleDividerDown}
        className={`shrink-0 relative group flex items-center justify-center ${
          isStacked ? 'h-[5px] w-full cursor-row-resize' : 'w-[5px] cursor-col-resize'
        }`}
      >
        <div
          className={`absolute bg-border/0 group-hover:bg-border/40 transition-colors ${
            isStacked
              ? 'inset-x-0 top-1/2 -translate-y-1/2 h-px'
              : 'inset-y-0 left-1/2 -translate-x-1/2 w-px'
          }`}
        />
        {isDragging && (
          <div
            className={`absolute panel-divider-active ${
              isStacked
                ? 'inset-x-0 top-1/2 -translate-y-1/2 h-px'
                : 'inset-y-0 left-1/2 -translate-x-1/2 w-px'
            }`}
          />
        )}
        <span className="text-text-muted/40 group-hover:text-text-muted/70 transition-colors text-xs select-none" aria-hidden="true">•••</span>
      </div>

      {/* Right/Bottom: Distractions sidebar */}
      <div
        style={isStacked ? { height: `${100 - leftPct}%` } : { width: `${100 - leftPct}%` }}
        className="overflow-hidden glass-panel"
      >
        <div className="h-full flex flex-col">
          {!isStacked && <div className="shrink-0 h-[50px]" />}
          <div className="flex-1 min-h-0">
            <DistractionSidebar date={date} showHeader keyboardShortcut />
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
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  const allBlocks = useTimeBlockStore((s) => s.blocks)
  const untimedBlocksAll = useTimeBlockStore((s) => s.untimedBlocks)
  const blocks = allBlocks[date!] ?? EMPTY_BLOCKS
  const addBlock = useTimeBlockStore((s) => s.addBlock)
  const updateBlock = useTimeBlockStore((s) => s.updateBlock)
  const removeBlock = useTimeBlockStore((s) => s.removeBlock)
  const deferBlock = useTimeBlockStore((s) => s.deferBlock)
  const moveBlockTasks = useTaskStore((s) => s.moveBlockTasks)
  const [deferringBlock, setDeferringBlock] = useState<TimeBlock | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Flow (Go With The Flow) state
  const flowIsActive = useFlowStore((s) => s.isActive)
  const flowActivate = useFlowStore((s) => s.activate)
  const dayBlocks = useTimeBlockStore((s) => s.blocks[date ?? '']) ?? EMPTY_BLOCKS
  const showFlowButton = !flowIsActive && dayBlocks.length > 0

  // Distractions (count for tab badges)
  const allDistractions = useTaskStore((s) => s.distractions)
  const distractions = (allDistractions[date!] || []).filter((d) => d.status === 'pending')

  // Pending tasks count for badges
  const allStoreTasks = useTaskStore((s) => s.tasks)
  const allTaskRefs = useTaskStore((s) => s.taskRefs)
  const activeBlockForCount = viewMode === 'detail' && activeBlockId
    ? blocks.find((b) => b.id === activeBlockId)
    : null
  const projectTitleNorm = activeBlockForCount?.title?.trim().toLowerCase() || null

  const pendingCount = useMemo(() => {
    if (!date) return 0
    let count = 0
    const linkedIds = new Set((allTaskRefs[date] || []).map((r) => r.originTaskId))
    for (const [d, taskList] of Object.entries(allStoreTasks)) {
      const isUntimedBlock = d.startsWith('__block__')
      const blockMatch = !isUntimedBlock ? d.match(/^(.+)__block__(.+)$/) : null
      const baseDate = blockMatch ? blockMatch[1] : d
      if (!isUntimedBlock && baseDate === date) continue

      // When in block detail, only count tasks from blocks with the same title
      if (projectTitleNorm) {
        if (isUntimedBlock) {
          const untimedId = d.slice('__block__'.length)
          const ub = untimedBlocksAll.find((b) => b.id === untimedId)
          if (!ub || ub.title.trim().toLowerCase() !== projectTitleNorm) continue
        } else {
          if (!blockMatch) continue
          const blockId = blockMatch[2]
          const dateBlocks = allBlocks[baseDate] || []
          const block = dateBlocks.find((b) => b.id === blockId)
          if (!block || block.title.trim().toLowerCase() !== projectTitleNorm) continue
        }
      }

      for (const task of taskList) {
        if (!task.completed && !linkedIds.has(task.id)) count++
      }
    }
    return count
  }, [allStoreTasks, allTaskRefs, allBlocks, untimedBlocksAll, date, projectTitleNorm])

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

  const handleFit = useCallback(
    (blockId: string) => {
      if (!date) return
      const block = blocks.find((b) => b.id === blockId)
      if (!block) return
      const blockKey = `${date}__block__${blockId}`
      const blockTasks = useTaskStore.getState().tasks[blockKey] ?? []
      // Use flow-tracked actual time for completed tasks; estimates for the rest.
      const completedFlowItems = useFlowStore.getState().completedByDate[date] ?? []
      const actualMinutesByTaskId = new Map<string, number>()
      for (const item of completedFlowItems) {
        if (item.blockId !== blockId) continue
        if (item.timeSpentSeconds <= 0) continue
        actualMinutesByTaskId.set(item.taskId, Math.ceil(item.timeSpentSeconds / 60))
      }
      const result = computeBlockFit(block, blockTasks, blocks, blockId, actualMinutesByTaskId)
      if (result.clamped === 'no-op') return
      updateBlock(date, blockId, { endTime: result.newEndTime })
      if (result.clamped === 'next-block') {
        setToast(`Não há espaço para ${result.overflowMinutes}min adicionais. Bloco ajustado ao máximo possível.`)
      } else if (result.clamped === 'min-duration') {
        setToast('Estimativas <15min — bloco ajustado ao mínimo de 15min.')
      }
    },
    [date, blocks, updateBlock]
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
                onClick={() => flowActivate(date)}
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
              <PendingTasksPanel currentDate={date!} projectTitle={activeBlock?.title} />
            ) : (
              <DistractionSidebar date={date!} showHeader={false} />
            )}
          </div>
        </div>
      )
    }

    // Wide: split panel (tasks left + distractions right)
    return (
      <div ref={containerRef} className="h-full flex bg-bg-primary" style={{ cursor: isDividerDragging ? 'col-resize' : undefined }}>
        {/* Left: titlebar + block header + tasks */}
        <div style={{ width: `${leftPct}%` }} className="flex flex-col overflow-hidden">
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
                  onClick={() => flowActivate(date)}
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

          <div className="flex-1 overflow-hidden">
            <DayView date={`${date!}__block__${activeBlockId}`} embedded />
          </div>
        </div>

        {/* Divider */}
        <div onMouseDown={handleDividerDown} className="shrink-0 w-[5px] relative group cursor-col-resize flex items-center justify-center">
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border/0 group-hover:bg-border/40 transition-colors" />
          {isDividerDragging && (
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px panel-divider-active" />
          )}
          <span className="text-text-muted/40 group-hover:text-text-muted/70 transition-colors text-xs select-none" aria-hidden="true">•••</span>
        </div>

        {/* Right: pending tasks + distractions — full height */}
        <div style={{ width: `${100 - leftPct}%` }} className="overflow-hidden glass-panel flex flex-col">
          <div className="shrink-0 h-[50px]" />
          {/* Tab bar */}
          <div className="shrink-0 px-4 pt-1 pb-2 flex gap-1">
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

          <div className="flex-1 min-h-0">
            {detailRightTab === 'pending' ? (
              <PendingTasksPanel currentDate={date!} projectTitle={activeBlock?.title} />
            ) : (
              <DistractionSidebar date={date!} showHeader={false} />
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
            {showFlowButton && date ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => flowActivate(date)}
                aria-label="Fluir"
                title="Go With The Flow"
                className="p-1.5 rounded-lg text-violet-400 hover:text-violet-500 hover:bg-bg-hover transition-colors"
              >
                <Waves size={16} />
              </motion.button>
            ) : null}
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
            <TimelineGrid blocks={blocks} onUpdate={handleUpdate} onRemove={handleRemove} onDefer={handleDefer} onFit={handleFit} onBlockClick={handleBlockClick} onCreateBlock={handleCreateBlock} />
          ) : (
            <DistractionSidebar date={date!} showHeader={false} />
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
    <div ref={containerRef} className="h-full flex bg-bg-primary" style={{ cursor: isDividerDragging ? 'col-resize' : undefined }}>
      {/* Left: header + timeline grid */}
      <div style={{ width: `${leftPct}%` }} className="flex flex-col overflow-hidden">
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
            {showFlowButton && date ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => flowActivate(date)}
                aria-label="Fluir"
                title="Go With The Flow"
                className="p-1.5 rounded-lg text-violet-400 hover:text-violet-500 hover:bg-bg-hover transition-colors"
              >
                <Waves size={16} />
              </motion.button>
            ) : null}
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

        {/* Timeline grid */}
        <div className="flex-1 overflow-hidden">
          <TimelineGrid blocks={blocks} onUpdate={handleUpdate} onRemove={handleRemove} onDefer={handleDefer} onFit={handleFit} onBlockClick={handleBlockClick} onCreateBlock={handleCreateBlock} />
        </div>
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

      {/* Right: distractions — full height */}
      <div style={{ width: `${100 - leftPct}%` }} className="overflow-hidden glass-panel">
        <div className="h-full flex flex-col">
          <div className="shrink-0 h-[50px]" />
          <div className="flex-1 min-h-0">
            <DistractionSidebar date={date!} showHeader />
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
      <Toast visible={!!toast} message={toast ?? ''} onClose={() => setToast(null)} duration={3500} />
    </div>
  )
}
