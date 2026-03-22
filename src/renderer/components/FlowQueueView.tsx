import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Check, Circle, Play, Plus } from 'lucide-react'
import { useFlowStore } from '../stores/flowStore'
import { useTaskStore } from '../stores/taskStore'
import { useTimeBlockStore } from '../stores/timeBlockStore'
import { formatEstimate } from '../utils/taskEstimates'
import { START_HOUR } from './TimeBlockItem'
import { useSettingsStore, formatTzOffset, getTzOffsetMinutes } from '../stores/settingsStore'
import type { TimeBlock } from '../stores/timeBlockStore'
import type { Task } from '../stores/taskStore'

const EMPTY_BLOCKS: TimeBlock[] = []
const EMPTY_TASKS: Task[] = []

function formatBlockTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatHour(h: number): string {
  return String(h).padStart(2, '0')
}

// Same visual order as TimelineGrid: 01, 02, ..., 23, 00
const HOURS_ORDER = Array.from({ length: 24 }, (_, i) => (i + START_HOUR) % 24)

// Zoomed grid: ~2 hours visible per screen height (~600px)
const HOUR_HEIGHT = 300

function timeToY(minutes: number): number {
  const shifted = ((minutes - START_HOUR * 60) + 1440) % 1440
  return (shifted / 60) * HOUR_HEIGHT
}

const GUTTER_WIDTH = 56
const SECONDARY_GUTTER = 48

const BLOCK_COLORS: Record<string, string> = {
  indigo: '#6366f1',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  sky: '#0ea5e9',
  violet: '#8b5cf6',
  slate: '#64748b'
}

interface FlowQueueViewProps {
  date: string
}

export default function FlowQueueView({ date }: FlowQueueViewProps) {
  const queue = useFlowStore((s) => s.queue)
  const currentIndex = useFlowStore((s) => s.currentIndex)
  const started = useFlowStore((s) => s.started)
  const startFlow = useFlowStore((s) => s.start)
  const deactivate = useFlowStore((s) => s.deactivate)
  const secondsRemaining = useFlowStore((s) => s.secondsRemaining)
  const taskTimerStartedAt = useFlowStore((s) => s.taskTimerStartedAt)
  const taskAccumulatedSeconds = useFlowStore((s) => s.taskAccumulatedSeconds)
  const allTasks = useTaskStore((s) => s.tasks)
  const allBlocks = useTimeBlockStore((s) => s.blocks)
  const blocks = allBlocks[date] ?? EMPTY_BLOCKS

  // Flow block info (single block mode)
  const flowBlockId = useFlowStore((s) => s.blockId)
  const flowBlock = blocks.find((b) => b.id === flowBlockId) || null
  const blockColor = flowBlock ? BLOCK_COLORS[flowBlock.color] || BLOCK_COLORS.indigo : '#94a3b8'
  const blockKey = flowBlockId ? `${date}__block__${flowBlockId}` : ''

  // Indexed queue items
  const indexedQueue = useMemo(() =>
    queue.map((item, index) => ({ ...item, index })),
    [queue]
  )

  // Stats
  const completed = queue.filter((q) => q.status === 'completed').length
  const total = queue.length


  // Hooks for running view (must be before any early return)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const updateTaskEstimate = useTaskStore((s) => s.updateTaskEstimate)
  const addTask = useTaskStore((s) => s.addTask)
  const [taskText, setTaskText] = useState('')
  const [showAddTask, setShowAddTask] = useState(false)
  const [editingEstimateId, setEditingEstimateId] = useState<string | null>(null)
  const [estimateInput, setEstimateInput] = useState('')
  const estimateInputRef = useRef<HTMLInputElement>(null)
  const taskRef = useRef<HTMLInputElement>(null)

  const currentItem = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null
  const addTaskBlockKey = blockKey || `${date}__block__${blocks[0]?.id || ''}`

  // Focus estimate input when editing
  useEffect(() => {
    if (editingEstimateId && estimateInputRef.current) {
      estimateInputRef.current.focus()
      estimateInputRef.current.select()
    }
  }, [editingEstimateId])

  const handleToggleTask = useCallback((blockKey: string, taskId: string) => {
    toggleTask(blockKey, taskId)
    // Flow auto-advance is handled by the taskStore subscription in flowStore
  }, [toggleTask])

  const handleEstimateClick = useCallback((taskId: string, currentMinutes: number | null) => {
    setEditingEstimateId(taskId)
    setEstimateInput(currentMinutes?.toString() || '')
  }, [])

  const handleEstimateCommit = useCallback((blockKey: string, taskId: string) => {
    const val = parseInt(estimateInput, 10)
    if (!isNaN(val) && val > 0) {
      updateTaskEstimate(blockKey, taskId, val)
      // Also update in flow queue
      const flowState = useFlowStore.getState()
      const newQueue = flowState.queue.map((q) =>
        q.taskId === taskId && q.blockKey === blockKey ? { ...q, estimatedMinutes: val } : q
      )
      useFlowStore.setState({ queue: newQueue })
    }
    setEditingEstimateId(null)
    setEstimateInput('')
  }, [estimateInput, updateTaskEstimate])

  const handleAddTask = useCallback(() => {
    const trimmed = taskText.trim()
    if (!trimmed) return
    addTask(addTaskBlockKey, trimmed)

    // Find the newly added task (last in the block's task list)
    const blockTasks = useTaskStore.getState().tasks[addTaskBlockKey] || []
    const newTask = blockTasks[blockTasks.length - 1]
    if (newTask) {
      const flowState = useFlowStore.getState()
      const newQueue = [...flowState.queue]
      // Insert at the end of the queue (all tasks are from the same block)
      newQueue.push({
        taskId: newTask.id,
        blockKey: addTaskBlockKey,
        blockId: flowBlockId || '',
        estimatedMinutes: null,
        timeSpentSeconds: 0,
        status: 'pending'
      })

      useFlowStore.setState({ queue: newQueue })
    }

    setTaskText('')
    setShowAddTask(false)
  }, [taskText, addTaskBlockKey, addTask, flowBlockId])


  // Task elapsed (needed in running view)
  const taskElapsed = taskTimerStartedAt
    ? taskAccumulatedSeconds + Math.floor((Date.now() - taskTimerStartedAt) / 1000)
    : taskAccumulatedSeconds

  const MIN_TASK_HEIGHT = 32
  const DEFAULT_TASK_MINUTES = 15
  const totalGridHeight = 24 * HOUR_HEIGHT + HOUR_HEIGHT / 2

  const { primaryTimezone, secondaryTimezone } = useSettingsStore()
  const hasSecondary = secondaryTimezone !== null
  const totalGutter = hasSecondary ? GUTTER_WIDTH + SECONDARY_GUTTER : GUTTER_WIDTH

  // Current time
  const [currentMinutes, setCurrentMinutes] = useState(() => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  })
  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date()
      setCurrentMinutes(now.getHours() * 60 + now.getMinutes())
    }, 60000)
    return () => clearInterval(id)
  }, [])

  // Auto-scroll to first block on mount
  const scrollRef = useRef<HTMLDivElement>(null)
  const didScrollRef = useRef(false)
  useEffect(() => {
    if (didScrollRef.current || !scrollRef.current || blocks.length === 0) return
    const sorted = [...blocks].sort((a, b) => a.startTime - b.startTime)
    const firstBlockY = timeToY(sorted[0].startTime)
    scrollRef.current.scrollTop = Math.max(0, firstBlockY - 20)
    didScrollRef.current = true
  }, [blocks])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-5 pt-2 pb-1.5 flex items-center justify-between">
        <span className="text-[10px] text-text-muted tabular-nums">
          {completed}/{total} {started ? 'concluídas' : 'tarefas'}
        </span>
        <div className="flex items-center gap-2">
          {!started && (
            <>
              <button
                onClick={deactivate}
                className="text-[10px] text-text-muted hover:text-text-secondary transition-colors"
              >
                Cancelar
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={startFlow}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-violet-500 text-white text-[11px] font-medium hover:bg-violet-600 transition-colors"
              >
                <Play size={12} />
                Iniciar
              </motion.button>
            </>
          )}
          {started && (
            <button
              onClick={() => { setShowAddTask((v) => !v); setTimeout(() => taskRef.current?.focus(), 50) }}
              className="p-0.5 rounded hover:bg-bg-hover transition-colors"
              title="Adicionar tarefa"
            >
              <Plus size={12} className="text-text-muted" />
            </button>
          )}
        </div>
      </div>

      {/* Add task inline */}
      {showAddTask && (
        <div className="shrink-0 px-5 pb-2">
          <input
            ref={taskRef}
            type="text"
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddTask()
              if (e.key === 'Escape') { setShowAddTask(false); setTaskText('') }
            }}
            placeholder="Nova tarefa..."
            className="w-full text-xs bg-bg-secondary/60 border border-border/40 rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-violet-500/50 transition-colors"
            spellCheck={false}
          />
        </div>
      )}

      {/* Two-panel: hour grid (left) + task list (right) */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex min-h-full">
          {/* Hour grid — fixed-width gutter */}
          <div className="shrink-0 relative mt-5" style={{ width: totalGutter, height: totalGridHeight }}>
            {HOURS_ORDER.map((h, visualIndex) => {
              const y = visualIndex * HOUR_HEIGHT
              return (
                <div key={h}>
                  <div
                    className="absolute pointer-events-none flex items-center justify-end pr-3"
                    style={{ top: y - 5, left: 0, width: GUTTER_WIDTH, height: 10 }}
                  >
                    <span className="text-[10px] text-text-muted/70 font-medium tabular-nums select-none leading-none">
                      {formatHour(h)}
                    </span>
                  </div>
                  {hasSecondary && secondaryTimezone && (() => {
                    const fromOffset = getTzOffsetMinutes(primaryTimezone)
                    const toOffset = getTzOffsetMinutes(secondaryTimezone)
                    const diff = toOffset - fromOffset
                    const secondaryHour = Math.floor(((h * 60 + diff + 1440) % 1440) / 60)
                    return (
                      <div
                        className="absolute pointer-events-none flex items-center justify-start pl-2"
                        style={{ top: y - 5, left: GUTTER_WIDTH, width: SECONDARY_GUTTER, height: 10 }}
                      >
                        <span className="text-[9px] text-text-muted/40 font-medium tabular-nums select-none leading-none">
                          {formatHour(secondaryHour)}
                        </span>
                      </div>
                    )
                  })()}
                  {/* Hour tick */}
                  <div
                    className="absolute border-t border-border/30 pointer-events-none"
                    style={{ top: y, right: 0, width: 8 }}
                  />
                  {/* Half-hour tick */}
                  <div
                    className="absolute border-t border-dashed border-border/15 pointer-events-none"
                    style={{ top: y + HOUR_HEIGHT / 2, right: 0, width: 4 }}
                  />
                </div>
              )
            })}

            {/* Current time indicator in gutter */}
            {(() => {
              const currentTimeTop = timeToY(currentMinutes)
              const ch = Math.floor(currentMinutes / 60)
              const cm = currentMinutes % 60
              const currentTimeLabel = `${String(ch).padStart(2, '0')}:${String(cm).padStart(2, '0')}`
              return (
                <div className="absolute z-20 pointer-events-none" style={{ top: currentTimeTop, left: 0, right: 0 }}>
                  <div className="absolute flex items-center justify-end pr-2" style={{ top: -8, left: 0, width: GUTTER_WIDTH, height: 16 }}>
                    <span className="text-[10px] text-error font-semibold tabular-nums select-none bg-bg-primary px-0.5 rounded leading-none">
                      {currentTimeLabel}
                    </span>
                  </div>
                  <div className="absolute right-0 flex items-center">
                    <div className="w-2 h-2 rounded-full bg-error shrink-0" />
                  </div>
                </div>
              )
            })()}

            {/* TZ labels */}
            <div className="absolute pointer-events-none flex items-center justify-end pr-3" style={{ top: -18, left: 0, width: GUTTER_WIDTH }}>
              <span className="text-[9px] text-text-muted/50 font-medium select-none">{formatTzOffset(primaryTimezone)}</span>
            </div>
          </div>

          {/* Task list — flat layout for single block */}
          <div className="flex-1 pt-3 pb-8 pr-3">
                  {/* Block header */}
                  <div className="flex items-center gap-2 py-1.5">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: blockColor }} />
                    <span className="text-[10px] font-medium text-text-muted truncate">{flowBlock?.title || 'Bloco'}</span>
                    {flowBlock && (
                      <span className="text-[10px] text-text-muted/50 tabular-nums shrink-0">
                        {formatBlockTime(flowBlock.startTime)}–{formatBlockTime(flowBlock.endTime)}
                      </span>
                    )}
                  </div>

                  {/* Tasks — stacked */}
                  <div className="flex flex-col gap-0.5">
                  {indexedQueue.map((item) => {
                    const blockTasks = allTasks[item.blockKey] ?? EMPTY_TASKS
                    const task = blockTasks.find((t) => t.id === item.taskId)
                    if (!task && (item.status === 'completed' || item.status === 'skipped')) return null
                    const taskLabel = task?.text || 'Tarefa'
                    const isItemActive = item.index === currentIndex
                    const isCompleted = item.status === 'completed' || task?.completed
                    const mins = item.estimatedMinutes ?? DEFAULT_TASK_MINUTES
                    const itemHeight = Math.max((mins / 60) * HOUR_HEIGHT, MIN_TASK_HEIGHT)

                    let estimateLabel: string | null = null
                    if (item.estimatedMinutes && isItemActive) {
                      const remainingSec = Math.max(0, item.estimatedMinutes * 60 - taskElapsed)
                      const remainingMin = Math.ceil(remainingSec / 60)
                      estimateLabel = remainingMin > 0 ? formatEstimate(remainingMin) : '0m'
                    }

                    return (
                      <div
                        key={`${item.blockId}-${item.taskId}`}
                        className={`flex items-start gap-2 px-2 pt-1.5 rounded-lg transition-colors ${
                          isCompleted ? 'opacity-40' : ''
                        }`}
                        style={{
                          minHeight: itemHeight,
                          backgroundColor: isItemActive ? blockColor + '20' : isCompleted ? blockColor + '08' : blockColor + '12',
                          borderLeft: `2px solid ${isItemActive ? blockColor : blockColor + '30'}`
                        }}
                      >
                        {/* Checkbox */}
                        <button
                          className="shrink-0"
                          onClick={() => !isCompleted && handleToggleTask(item.blockKey, item.taskId)}
                        >
                          {isCompleted ? (
                            <Check size={14} className="text-success" />
                          ) : isItemActive ? (
                            <Circle size={14} className="text-violet-500 fill-violet-500 hover:text-success cursor-pointer" />
                          ) : (
                            <Circle size={14} className="text-border hover:text-success cursor-pointer" />
                          )}
                        </button>

                        {/* Task name */}
                        <span className={`flex-1 text-sm truncate ${
                          isCompleted
                            ? 'line-through text-text-muted'
                            : isItemActive
                              ? 'text-text-primary font-medium'
                              : 'text-text-secondary'
                        }`}>
                          {taskLabel}
                        </span>

                        {/* Estimate */}
                        {editingEstimateId === item.taskId ? (
                          <input
                            ref={estimateInputRef}
                            type="text"
                            value={estimateInput}
                            onChange={(e) => setEstimateInput(e.target.value.replace(/[^0-9]/g, ''))}
                            onBlur={() => handleEstimateCommit(item.blockKey, item.taskId)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleEstimateCommit(item.blockKey, item.taskId)
                              if (e.key === 'Escape') { setEditingEstimateId(null); setEstimateInput('') }
                            }}
                            placeholder="min"
                            className="w-10 text-[10px] text-center bg-bg-secondary border border-border rounded px-1 py-0.5 outline-none focus:border-violet-500/50 tabular-nums"
                            maxLength={4}
                          />
                        ) : item.estimatedMinutes ? (
                          <button
                            onClick={() => handleEstimateClick(item.taskId, item.estimatedMinutes)}
                            className={`shrink-0 text-[10px] tabular-nums px-1.5 py-0.5 rounded hover:bg-bg-secondary cursor-pointer ${
                              isItemActive ? 'text-violet-400' : 'text-text-muted'
                            }`}
                          >
                            {isItemActive && estimateLabel
                              ? `${estimateLabel}`
                              : formatEstimate(item.estimatedMinutes)}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleEstimateClick(item.taskId, null)}
                            className="shrink-0 text-[10px] tabular-nums text-text-muted/30 hover:text-text-muted/60 px-1.5 py-0.5 rounded hover:bg-bg-secondary cursor-pointer"
                          >
                            + tempo
                          </button>
                        )}
                      </div>
                    )
                  })}
                  </div>
          </div>
        </div>
      </div>
    </div>
  )
}
