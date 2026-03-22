import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Check, Circle, Play, Plus } from 'lucide-react'
import { useFlowStore } from '../stores/flowStore'
import { useTaskStore } from '../stores/taskStore'
import { useTimeBlockStore } from '../stores/timeBlockStore'
import { formatEstimate } from '../utils/taskEstimates'
import { useSettingsStore, formatTzOffset, getTzOffsetMinutes } from '../stores/settingsStore'
import type { TimeBlock } from '../stores/timeBlockStore'
import type { Task } from '../stores/taskStore'

const EMPTY_BLOCKS: TimeBlock[] = []
const EMPTY_TASKS: Task[] = []

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Match timeline grid constants
const START_HOUR = 1
const HOUR_HEIGHT = 120 // taller than main timeline (60) for better task readability
const HOURS_ORDER = Array.from({ length: 24 }, (_, i) => (i + START_HOUR) % 24)
const TOTAL_GRID_HEIGHT = 24 * HOUR_HEIGHT

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
  const taskTimerStartedAt = useFlowStore((s) => s.taskTimerStartedAt)
  const taskAccumulatedSeconds = useFlowStore((s) => s.taskAccumulatedSeconds)
  const allTasks = useTaskStore((s) => s.tasks)
  const allBlocks = useTimeBlockStore((s) => s.blocks)
  const blocks = allBlocks[date] ?? EMPTY_BLOCKS

  // Flow block info
  const flowBlockId = useFlowStore((s) => s.blockId)
  const flowBlock = blocks.find((b) => b.id === flowBlockId) || null
  const blockColor = flowBlock ? BLOCK_COLORS[flowBlock.color] || BLOCK_COLORS.indigo : '#94a3b8'
  const blockKey = flowBlockId ? `${date}__block__${flowBlockId}` : ''

  // Other blocks (not the flow block) to show as context
  const otherBlocks = useMemo(() =>
    blocks.filter((b) => b.id !== flowBlockId).sort((a, b) => a.startTime - b.startTime),
    [blocks, flowBlockId]
  )

  // Indexed queue items
  const indexedQueue = useMemo(() =>
    queue.map((item, index) => ({ ...item, index })),
    [queue]
  )

  // Stats
  const completed = queue.filter((q) => q.status === 'completed').length
  const total = queue.length

  // Block actions
  const updateBlock = useTimeBlockStore((s) => s.updateBlock)

  // Task actions
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const updateTaskEstimate = useTaskStore((s) => s.updateTaskEstimate)
  const addTask = useTaskStore((s) => s.addTask)
  const [taskText, setTaskText] = useState('')
  const [showAddTask, setShowAddTask] = useState(false)
  const [editingEstimateId, setEditingEstimateId] = useState<string | null>(null)
  const [estimateInput, setEstimateInput] = useState('')
  const estimateInputRef = useRef<HTMLInputElement>(null)
  const taskRef = useRef<HTMLInputElement>(null)

  const addTaskBlockKey = blockKey || `${date}__block__${blocks[0]?.id || ''}`

  useEffect(() => {
    if (editingEstimateId && estimateInputRef.current) {
      estimateInputRef.current.focus()
      estimateInputRef.current.select()
    }
  }, [editingEstimateId])

  const handleToggleTask = useCallback((blockKey: string, taskId: string) => {
    toggleTask(blockKey, taskId)
  }, [toggleTask])

  const handleEstimateClick = useCallback((taskId: string, currentMinutes: number | null) => {
    setEditingEstimateId(taskId)
    setEstimateInput(currentMinutes?.toString() || '')
  }, [])

  const handleEstimateCommit = useCallback((blockKey: string, taskId: string) => {
    const val = parseInt(estimateInput, 10)
    if (!isNaN(val) && val > 0) {
      updateTaskEstimate(blockKey, taskId, val)
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

    const blockTasks = useTaskStore.getState().tasks[addTaskBlockKey] || []
    const newTask = blockTasks[blockTasks.length - 1]
    if (newTask) {
      const flowState = useFlowStore.getState()
      const newQueue = [...flowState.queue]
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

  // Task elapsed
  const taskElapsed = taskTimerStartedAt
    ? taskAccumulatedSeconds + Math.floor((Date.now() - taskTimerStartedAt) / 1000)
    : taskAccumulatedSeconds

  const MIN_TASK_HEIGHT = 32
  const DEFAULT_TASK_MINUTES = 15

  const { primaryTimezone, secondaryTimezone } = useSettingsStore()
  const hasSecondary = secondaryTimezone !== null
  const totalGutter = hasSecondary ? GUTTER_WIDTH + SECONDARY_GUTTER : GUTTER_WIDTH

  // Current time indicator
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

  // Auto-scroll to flow block on mount
  const scrollRef = useRef<HTMLDivElement>(null)
  const didScrollRef = useRef(false)
  useEffect(() => {
    if (didScrollRef.current || !scrollRef.current || !flowBlock) return
    const blockY = timeToY(flowBlock.startTime)
    scrollRef.current.scrollTop = Math.max(0, blockY - 40)
    didScrollRef.current = true
  }, [flowBlock])

  // Drag to move flow block
  const SNAP_MINUTES = 5
  const isDraggingBlock = useRef(false)

  const handleBlockDragStart = useCallback((e: React.MouseEvent) => {
    if (!flowBlock || !scrollRef.current) return
    e.preventDefault()
    isDraggingBlock.current = true
    const startY = e.clientY
    const startScrollTop = scrollRef.current.scrollTop
    const duration = flowBlock.endTime - flowBlock.startTime
    const startTime = flowBlock.startTime

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingBlock.current || !scrollRef.current) return
      const scrollDelta = scrollRef.current.scrollTop - startScrollTop
      const deltaY = ev.clientY - startY + scrollDelta
      const deltaMinutes = (deltaY / HOUR_HEIGHT) * 60
      let newStart = startTime + deltaMinutes
      // Snap
      newStart = Math.round(newStart / SNAP_MINUTES) * SNAP_MINUTES
      // Clamp to day
      newStart = Math.max(0, Math.min(1440 - duration, newStart))
      const newEnd = newStart + duration
      updateBlock(date, flowBlock.id, { startTime: newStart, endTime: newEnd })
    }

    const onMouseUp = () => {
      isDraggingBlock.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [flowBlock, date, updateBlock])

  // Render a task item
  function renderTaskItem(item: typeof indexedQueue[0]) {
    const blockTasks = allTasks[item.blockKey] ?? EMPTY_TASKS
    const task = blockTasks.find((t) => t.id === item.taskId)
    if (!task && (item.status === 'completed' || item.status === 'skipped')) return null
    const taskLabel = task?.text || 'Tarefa'
    const isItemActive = item.index === currentIndex
    const isCompleted = item.status === 'completed' || task?.completed

    // Time spent: live elapsed for active, persisted for stopped
    const itemElapsed = isItemActive ? taskElapsed : item.timeSpentSeconds

    let estimateLabel: string | null = null
    if (item.estimatedMinutes && itemElapsed > 0) {
      const remainingSec = Math.max(0, item.estimatedMinutes * 60 - itemElapsed)
      const remainingMin = Math.ceil(remainingSec / 60)
      estimateLabel = remainingMin > 0 ? formatEstimate(remainingMin) : '0m'
    }

    // BG opacity: starts at 20%, grows with progress toward estimate
    let bgOpacity = '20'
    if (isCompleted) {
      bgOpacity = '08'
    } else if (itemElapsed > 0 && item.estimatedMinutes) {
      const progress = Math.min(itemElapsed / (item.estimatedMinutes * 60), 1)
      const hex = Math.round(0x20 + progress * (0x60 - 0x20)).toString(16).padStart(2, '0')
      bgOpacity = hex
    } else if (itemElapsed > 0) {
      bgOpacity = '35'
    }

    const mins = item.estimatedMinutes ?? DEFAULT_TASK_MINUTES
    const itemHeight = Math.max((mins / 60) * HOUR_HEIGHT, MIN_TASK_HEIGHT)

    return (
      <div
        key={`${item.blockId}-${item.taskId}`}
        className={`flex items-start gap-2 px-2 pt-1.5 rounded-lg transition-colors ${
          isCompleted ? 'opacity-40' : ''
        }`}
        style={{
          minHeight: itemHeight,
          backgroundColor: blockColor + bgOpacity
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
            {estimateLabel ?? formatEstimate(item.estimatedMinutes)}
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
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-5 pt-2 pb-1.5 flex items-center justify-between">
        <span className="text-[10px] text-text-muted tabular-nums">
          {completed}/{total} {started ? 'concluídas' : 'tarefas'}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowAddTask((v) => !v); setTimeout(() => taskRef.current?.focus(), 50) }}
            className="p-0.5 rounded hover:bg-bg-hover transition-colors"
            title="Adicionar tarefa"
          >
            <Plus size={12} className="text-text-muted" />
          </button>
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

      {/* Full 24h grid with blocks */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex relative" style={{ height: TOTAL_GRID_HEIGHT }}>
          {/* Current time indicator — spans full width */}
          {(() => {
            const y = timeToY(currentMinutes) + 20 /* mt-5 offset */
            const currentTimeLabel = formatTime(currentMinutes)
            return (
              <div className="absolute z-20 pointer-events-none" style={{ top: y, left: 0, right: 0 }}>
                {/* Time label in gutter */}
                <div
                  className="absolute flex items-center justify-end pr-2"
                  style={{ top: -8, left: 0, width: GUTTER_WIDTH, height: 16 }}
                >
                  <span className="text-[10px] text-error font-semibold tabular-nums select-none bg-bg-primary px-0.5 rounded leading-none">
                    {currentTimeLabel}
                  </span>
                </div>
                {/* Secondary timezone */}
                {hasSecondary && secondaryTimezone && (
                  <div
                    className="absolute flex items-center justify-start pl-1"
                    style={{ top: -8, left: GUTTER_WIDTH, width: SECONDARY_GUTTER, height: 16 }}
                  >
                    <span className="text-[9px] text-error/60 font-semibold tabular-nums select-none bg-bg-primary px-0.5 rounded leading-none">
                      {(() => {
                        const fromOffset = getTzOffsetMinutes(primaryTimezone)
                        const toOffset = getTzOffsetMinutes(secondaryTimezone)
                        const diff = toOffset - fromOffset
                        const secMinutes = ((currentMinutes + diff) + 1440) % 1440
                        return formatTime(secMinutes)
                      })()}
                    </span>
                  </div>
                )}
                {/* Red line + dot */}
                <div className="flex items-center" style={{ marginLeft: totalGutter - 4 }}>
                  <div className="w-2 h-2 rounded-full bg-error shrink-0" />
                  <div className="flex-1 h-[1.5px] bg-error/70" />
                </div>
              </div>
            )
          })()}
          {/* Hour gutter */}
          <div className="shrink-0 relative mt-5" style={{ width: totalGutter, height: TOTAL_GRID_HEIGHT }}>
            {HOURS_ORDER.map((h, visualIndex) => {
              const y = visualIndex * HOUR_HEIGHT
              return (
                <div key={h}>
                  <div
                    className="absolute pointer-events-none flex items-center justify-end pr-3"
                    style={{ top: y - 5, left: 0, width: GUTTER_WIDTH, height: 10 }}
                  >
                    <span className="text-[10px] text-text-muted/70 font-medium tabular-nums select-none leading-none">
                      {String(h).padStart(2, '0')}
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
                          {String(secondaryHour).padStart(2, '0')}
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

            {/* TZ label */}
            <div className="absolute pointer-events-none flex items-center justify-end pr-3" style={{ top: -18, left: 0, width: GUTTER_WIDTH }}>
              <span className="text-[9px] text-text-muted/50 font-medium select-none">{formatTzOffset(primaryTimezone)}</span>
            </div>
          </div>

          {/* Blocks + tasks area */}
          <div className="flex-1 relative mt-5" style={{ height: TOTAL_GRID_HEIGHT }}>
            {/* Other blocks (context, non-interactive) */}
            {otherBlocks.map((b) => {
              const top = timeToY(b.startTime)
              const height = ((b.endTime - b.startTime) / 60) * HOUR_HEIGHT
              const color = BLOCK_COLORS[b.color] || BLOCK_COLORS.slate
              return (
                <div
                  key={b.id}
                  className="absolute left-0 right-3 rounded-md pointer-events-none"
                  style={{
                    top,
                    height,
                    backgroundColor: color + '10',
                    borderLeft: `2px solid ${color}30`
                  }}
                >
                  <span className="text-[9px] text-text-muted/40 px-2 pt-1 block truncate">
                    {b.title}
                  </span>
                </div>
              )
            })}

            {/* Flow block start marker — draggable line */}
            {flowBlock && (() => {
              const top = timeToY(flowBlock.startTime)
              return (
                <div
                  className="absolute left-0 right-3 flex items-center gap-2 cursor-grab active:cursor-grabbing select-none z-10"
                  style={{ top: top - 10, height: 20 }}
                  onMouseDown={handleBlockDragStart}
                >
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: blockColor }} />
                  <span className="text-[10px] font-medium truncate" style={{ color: blockColor }}>{flowBlock.title}</span>
                  <span className="text-[10px] text-text-muted/50 tabular-nums shrink-0">
                    {formatTime(flowBlock.startTime)}–{formatTime(flowBlock.endTime)}
                  </span>
                  <div className="flex-1 border-t border-dashed" style={{ borderColor: blockColor + '40' }} />
                </div>
              )
            })()}

            {/* Tasks — positioned at block start, stacked by estimate height */}
            {flowBlock && (
              <div
                className="absolute left-0 right-3 flex flex-col gap-0.5"
                style={{ top: timeToY(flowBlock.startTime) + 12 }}
              >
                {indexedQueue.map((item) => renderTaskItem(item))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
