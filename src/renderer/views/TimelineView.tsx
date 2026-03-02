import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, parseISO, addDays, subDays } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useTimeBlockStore, type TimeBlock } from '../stores/timeBlockStore'
import { useTaskStore } from '../stores/taskStore'
import TimelineGrid from '../components/TimelineGrid'
import DistractionItem from '../components/DistractionItem'
import DayView from './DayView'
import PomodoroTimer from '../components/PomodoroTimer'
import DailyStandupModal from '../components/DailyStandupModal'
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

export default function TimelineView() {
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()

  const [viewMode, setViewMode] = useState<ViewMode>('timeline')
  const viewModeRef = useRef<ViewMode>('timeline')
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  const allBlocks = useTimeBlockStore((s) => s.blocks)
  const blocks = allBlocks[date!] ?? EMPTY_BLOCKS
  const addBlock = useTimeBlockStore((s) => s.addBlock)
  const updateBlock = useTimeBlockStore((s) => s.updateBlock)
  const removeBlock = useTimeBlockStore((s) => s.removeBlock)

  // Distractions
  const allDistractions = useTaskStore((s) => s.distractions)
  const addDistraction = useTaskStore((s) => s.addDistraction)
  const convertToTask = useTaskStore((s) => s.convertToTask)
  const distractions = (allDistractions[date!] || []).filter((d) => d.status === 'pending')
  const [distractionInput, setDistractionInput] = useState('')

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
  const [activeTab, setActiveTab] = useState<'timeline' | 'distractions'>('timeline')
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
    if (viewModeRef.current === 'detail') {
      viewModeRef.current = 'timeline'
      setViewMode('timeline')
      setActiveBlockId(null)
    } else {
      navigate('/')
    }
  }, [navigate])

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
              <PomodoroTimer />
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
            <PomodoroTimer />
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

          {/* Right: distractions (belong to the day, not the block) */}
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
            <PomodoroTimer />
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
            <TimelineGrid blocks={blocks} onUpdate={handleUpdate} onRemove={handleRemove} onBlockClick={handleBlockClick} onCreateBlock={handleCreateBlock} />
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
          <PomodoroTimer />
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
          <TimelineGrid blocks={blocks} onUpdate={handleUpdate} onRemove={handleRemove} onBlockClick={handleBlockClick} onCreateBlock={handleCreateBlock} />
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
    </div>
  )
}
