import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ChevronUp, ChevronDown, Maximize2 } from 'lucide-react'
import { format, parseISO, isToday } from 'date-fns'
import { pt } from 'date-fns/locale'
import { usePomodoroStore } from '../stores/pomodoroStore'
import { useTimeBlockStore, type TimeBlock } from '../stores/timeBlockStore'
import { useTaskStore, type Distraction } from '../stores/taskStore'
import TaskEditor from '../components/TaskEditor'
import { PomodoroTimerCore } from '../components/PomodoroTimer'

const EXPANDED_WIDTH = 480
const EXPANDED_HEIGHT = 540
const COLLAPSED_WIDTH = 280
const COLLAPSED_HEIGHT = 80

function formatBlockTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function getCurrentBlock(blocks: TimeBlock[]): TimeBlock | null {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  return blocks.find((b) => b.startTime <= currentMinutes && b.endTime > currentMinutes) || null
}

function getNextBlock(blocks: TimeBlock[]): TimeBlock | null {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const future = blocks.filter((b) => b.startTime > currentMinutes).sort((a, b) => a.startTime - b.startTime)
  return future[0] || null
}

function getGapMinutes(blocks: TimeBlock[]): number | null {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const current = getCurrentBlock(blocks)
  if (!current) return null
  const next = blocks
    .filter((b) => b.startTime >= current.endTime)
    .sort((a, b) => a.startTime - b.startTime)[0]
  if (!next) return null
  const gapEnd = next.startTime
  const remaining = gapEnd - currentMinutes
  return remaining > 0 ? remaining : null
}

interface StealthyViewProps {
  onExit: () => void
}

export default function StealthyView({ onExit }: StealthyViewProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [distractionText, setDistractionText] = useState('')
  const distractionInputRef = useRef<HTMLInputElement>(null)

  // Pomodoro state (read-only for display, controls via PomodoroTimerCore)
  const stealthyBlockId = usePomodoroStore((s) => s.stealthyBlockId)
  const stealthyDate = usePomodoroStore((s) => s.stealthyDate)

  // Active date: stealthyDate (captured on entry) > today fallback
  const activeDate = stealthyDate || format(new Date(), 'yyyy-MM-dd')
  const dateLabel = useMemo(() => {
    const parsed = parseISO(activeDate)
    return isToday(parsed) ? 'Hoje' : format(parsed, "EEE, d MMM", { locale: pt })
  }, [activeDate])
  const allBlocks = useTimeBlockStore((s) => s.blocks)
  const blocks = useMemo(() => allBlocks[activeDate] || [], [allBlocks, activeDate])

  // Use pinned block (from TimelineView) or fall back to time-based detection
  const pinnedBlock = useMemo(() => {
    if (!stealthyBlockId) return null
    return blocks.find((b) => b.id === stealthyBlockId) || null
  }, [stealthyBlockId, blocks])
  const currentBlock = useMemo(() => pinnedBlock || getCurrentBlock(blocks), [pinnedBlock, blocks])
  const nextBlock = useMemo(() => getNextBlock(blocks), [blocks])
  const blockTaskKey = currentBlock ? `${activeDate}__block__${currentBlock.id}` : activeDate
  const allTasks = useTaskStore((s) => s.tasks)
  const tasks = useMemo(() => allTasks[blockTaskKey] || [], [allTasks, blockTaskKey])
  // First pending task (for collapsed view)
  const firstPendingTask = useMemo(() => tasks.find((t) => !t.completed), [tasks])

  // Distractions
  const allDistractions = useTaskStore((s) => s.distractions)
  const distractions = useMemo(() => allDistractions[activeDate] || [], [allDistractions, activeDate])
  const pendingDistractions = useMemo(() => distractions.filter((d: Distraction) => d.status === 'pending'), [distractions])
  const addDistraction = useTaskStore((s) => s.addDistraction)

  // Gap to next block
  const gapMinutes = useMemo(() => getGapMinutes(blocks), [blocks])

  // Resize window on collapse/expand
  useEffect(() => {
    if (collapsed) {
      window.bloc?.stealthy.resize({ width: COLLAPSED_WIDTH, height: COLLAPSED_HEIGHT, resizable: false })
    } else {
      window.bloc?.stealthy.resize({ width: EXPANDED_WIDTH, height: EXPANDED_HEIGHT, resizable: true })
    }
  }, [collapsed])

  // Handle distraction capture
  const handleCaptureDistraction = useCallback(() => {
    const trimmed = distractionText.trim()
    if (!trimmed) return
    addDistraction(activeDate, trimmed)
    setDistractionText('')
  }, [distractionText, activeDate, addDistraction])

  // --- COLLAPSED PLAYER VIEW ---
  if (collapsed) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="h-full flex flex-col bg-bg-primary/95 backdrop-blur-xl rounded-xl overflow-hidden select-none"
      >
        {/* Row 1: PomodoroTimer + task + expand */}
        <div className="titlebar-drag flex items-center gap-2 px-3 pt-2 pb-1">
          <div className="shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <PomodoroTimerCore date={activeDate} hideStealthy />
          </div>
          <div className="flex-1 min-w-0">
            {firstPendingTask ? (
              <span className="text-xs text-text-primary truncate block font-medium">{firstPendingTask.text}</span>
            ) : (
              <span className="text-[10px] text-text-muted">Sem tarefas</span>
            )}
          </div>
          <div className="shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button onClick={() => setCollapsed(false)} className="p-0.5 hover:opacity-80 transition-opacity" aria-label="Expandir">
              <ChevronDown size={12} className="text-text-muted" />
            </button>
          </div>
        </div>

        {/* Row 2: distraction quick capture */}
        <div className="px-3 pb-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <input
            type="text"
            value={distractionText}
            onChange={(e) => setDistractionText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCaptureDistraction() }}
            placeholder="Anotar distração..."
            className="w-full text-[11px] bg-bg-secondary/50 border border-border/30 rounded-md px-2 py-1 text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 transition-colors"
            spellCheck={false}
          />
        </div>
      </motion.div>
    )
  }

  // --- EXPANDED VIEW ---
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="h-full flex flex-col bg-bg-primary/95 backdrop-blur-xl rounded-xl overflow-hidden select-none"
    >
      {/* Drag handle + controls */}
      <div className="titlebar-drag shrink-0 flex items-center justify-between px-3 pt-2 pb-1">
        <span className="text-[10px] font-medium text-text-muted tracking-wider capitalize">{dateLabel}</span>
        <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={() => setCollapsed(true)} className="p-1 rounded hover:bg-bg-hover transition-colors" aria-label="Colapsar">
            <ChevronUp size={12} className="text-text-muted" />
          </button>
          <button onClick={onExit} className="p-1 rounded hover:bg-bg-hover transition-colors" aria-label="Sair do modo stealthy">
            <Maximize2 size={12} className="text-text-muted" />
          </button>
        </div>
      </div>

      {/* Pomodoro Timer + Current/Next Block — same line */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2">
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <PomodoroTimerCore date={activeDate} hideStealthy />
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          {currentBlock ? (
            <>
              <div className={`shrink-0 w-2 h-2 rounded-full`} style={{ backgroundColor: currentBlock.color === 'indigo' ? 'var(--color-accent)' : `var(--color-${currentBlock.color}, #6366f1)` }} />
              <span className="text-xs text-text-secondary truncate">{currentBlock.title}</span>
              <span className="text-[10px] text-text-muted shrink-0">
                {formatBlockTime(currentBlock.startTime)}–{formatBlockTime(currentBlock.endTime)}
              </span>
            </>
          ) : nextBlock ? (
            <>
              <div className="shrink-0 w-2 h-2 rounded-full bg-border" />
              <span className="text-[11px] text-text-muted truncate">Próximo: {nextBlock.title}</span>
              <span className="text-[10px] text-text-muted shrink-0">{formatBlockTime(nextBlock.startTime)}</span>
            </>
          ) : (
            <span className="text-[11px] text-text-muted">Sem blocos</span>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="shrink-0 mx-3 border-t border-border/30" />

      {/* Tasks — full TaskEditor */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <TaskEditor date={blockTaskKey} tasks={tasks} />
      </div>

      {/* Distractions */}
      <div className="shrink-0 px-3 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
            Distrações {pendingDistractions.length > 0 && `(${pendingDistractions.length})`}
          </span>
        </div>
        {/* Quick capture input */}
        <div className="flex items-center gap-1.5">
          <input
            ref={distractionInputRef}
            type="text"
            value={distractionText}
            onChange={(e) => setDistractionText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCaptureDistraction() }}
            placeholder="Anotar distração..."
            className="flex-1 text-xs bg-bg-secondary/60 border border-border/40 rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 transition-colors"
            spellCheck={false}
          />
        </div>
        {/* Recent distractions */}
        {pendingDistractions.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {pendingDistractions.slice(-3).reverse().map((d: Distraction) => (
              <div key={d.id} className="flex items-center gap-1.5 py-0.5">
                <div className="shrink-0 w-1.5 h-1.5 rounded-full border border-distraction" />
                <span className="text-[10px] text-text-muted tabular-nums">{format(d.createdAt, 'HH:mm')}</span>
                <span className="text-[10px] text-text-secondary truncate">{d.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
