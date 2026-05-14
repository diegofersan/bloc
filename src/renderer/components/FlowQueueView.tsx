import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Check, Circle, GripVertical, Play, Plus } from 'lucide-react'
import { useFlowStore, type FlowQueueItem } from '../stores/flowStore'
import { useTaskStore } from '../stores/taskStore'
import { useTimeBlockStore } from '../stores/timeBlockStore'
import { formatEstimate } from '../utils/taskEstimates'
import type { TimeBlock } from '../stores/timeBlockStore'
import type { Task } from '../stores/taskStore'

const EMPTY_BLOCKS: TimeBlock[] = []
const EMPTY_TASKS: Task[] = []

const BLOCK_COLORS: Record<string, string> = {
  indigo: '#6366f1',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  sky: '#0ea5e9',
  violet: '#8b5cf6',
  slate: '#64748b'
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
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
  const jumpToBlock = useFlowStore((s) => s.jumpToBlock)
  const taskTimerStartedAt = useFlowStore((s) => s.taskTimerStartedAt)
  const taskAccumulatedSeconds = useFlowStore((s) => s.taskAccumulatedSeconds)
  const allTasks = useTaskStore((s) => s.tasks)
  const taskRefs = useTaskStore((s) => s.taskRefs[date]) ?? []
  const getResolvedTask = useTaskStore((s) => s.getResolvedTask)
  const toggleTaskRef = useTaskStore((s) => s.toggleTaskRef)
  const allBlocks = useTimeBlockStore((s) => s.blocks)
  const blocks = allBlocks[date] ?? EMPTY_BLOCKS
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const moveTask = useTaskStore((s) => s.moveTask)
  const addTask = useTaskStore((s) => s.addTask)
  const updateTaskEstimate = useTaskStore((s) => s.updateTaskEstimate)

  // Inline estimate editing
  const [editingEstimate, setEditingEstimate] = useState<{ queueIndex: number; blockKey: string; taskId: string } | null>(null)
  const [estimateInput, setEstimateInput] = useState('')
  const estimateInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingEstimate && estimateInputRef.current) {
      estimateInputRef.current.focus()
      estimateInputRef.current.select()
    }
  }, [editingEstimate])

  const handleEstimateClick = useCallback((queueIndex: number, blockKey: string, taskId: string, currentMinutes: number | null) => {
    setEditingEstimate({ queueIndex, blockKey, taskId })
    setEstimateInput(currentMinutes?.toString() || '')
  }, [])

  const handleEstimateCommit = useCallback(() => {
    if (!editingEstimate) return
    const val = parseInt(estimateInput, 10)
    if (!isNaN(val) && val > 0) {
      updateTaskEstimate(editingEstimate.blockKey, editingEstimate.taskId, val)
      const flowState = useFlowStore.getState()
      const liveElapsed = flowState.getTaskElapsedSeconds()
      const idx = editingEstimate.queueIndex
      const newQueue = flowState.queue.map((q, i) =>
        i === idx ? { ...q, estimatedMinutes: val, timeSpentSeconds: liveElapsed } : q
      )
      const row = flowState.queue[idx]
      const isActiveSession =
        flowState.started &&
        idx === flowState.currentIndex &&
        row?.status === 'active'
      if (isActiveSession) {
        const now = Date.now()
        const anchor =
          flowState.phase === 'working' && !flowState.isPaused ? now : null
        useFlowStore.setState({
          queue: newQueue,
          taskAccumulatedSeconds: liveElapsed,
          taskTimerStartedAt: anchor
        })
      } else {
        useFlowStore.setState({ queue: newQueue })
      }
    }
    setEditingEstimate(null)
    setEstimateInput('')
  }, [editingEstimate, estimateInput, updateTaskEstimate])

  // Blocks sorted by time
  const sortedBlocks = useMemo(
    () => [...blocks].sort((a, b) => a.startTime - b.startTime),
    [blocks]
  )

  // Group queue items by blockId, preserving order within each block
  const blockGroups = useMemo(() => {
    const groups: Record<string, { block: TimeBlock; items: { item: FlowQueueItem; queueIndex: number }[] }> = {}
    for (const b of sortedBlocks) {
      groups[b.id] = { block: b, items: [] }
    }
    queue.forEach((item, queueIndex) => {
      if (groups[item.blockId]) {
        groups[item.blockId].items.push({ item, queueIndex })
      }
    })
    return sortedBlocks.map((b) => groups[b.id]).filter((g) => g !== undefined)
  }, [queue, sortedBlocks])

  // Stats
  const completed = queue.filter((q) => q.status === 'completed').length
  const total = queue.length

  // Live task elapsed (re-renders every second when active)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!started || !taskTimerStartedAt) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [started, taskTimerStartedAt])

  const getTaskElapsed = useCallback(
    (queueIndex: number) => {
      if (queueIndex !== currentIndex) return queue[queueIndex]?.timeSpentSeconds ?? 0
      if (!taskTimerStartedAt) return taskAccumulatedSeconds
      return taskAccumulatedSeconds + Math.floor((Date.now() - taskTimerStartedAt) / 1000)
    },
    [currentIndex, taskTimerStartedAt, taskAccumulatedSeconds, queue]
  )

  // Drag state: track which task is being dragged
  const dragRef = useRef<{ queueIndex: number; blockId: string } | null>(null)
  const [dragQueueIndex, setDragQueueIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<{ blockId: string; position: number } | null>(null)

  const handleDragStart = useCallback((queueIndex: number, blockId: string) => {
    const item = queue[queueIndex]
    if (item.status === 'completed') return
    dragRef.current = { queueIndex, blockId }
    setDragQueueIndex(queueIndex)
  }, [queue])

  const handleTaskDragOver = useCallback((e: React.DragEvent, blockId: string, position: number) => {
    e.preventDefault()
    setDropTarget({ blockId, position })
  }, [])

  const handleBlockDragOver = useCallback((e: React.DragEvent, blockId: string) => {
    e.preventDefault()
    // Drop at end of block
    const group = blockGroups.find((g) => g.block.id === blockId)
    setDropTarget({ blockId, position: group?.items.length ?? 0 })
  }, [blockGroups])

  const handleDrop = useCallback((targetBlockId: string, targetPosition: number) => {
    if (!dragRef.current) return
    const { queueIndex: sourceQueueIndex, blockId: sourceBlockId } = dragRef.current
    const sourceItem = queue[sourceQueueIndex]
    if (!sourceItem) return

    const sourceBlockKey = sourceItem.blockKey
    const targetBlockKey = `${date}__block__${targetBlockId}`

    // Move task in task store if changing blocks
    if (sourceBlockId !== targetBlockId) {
      moveTask(sourceBlockKey, targetBlockKey, sourceItem.taskId)
    }

    // Rebuild queue: update the moved item's block info and reorder
    const newQueue = [...queue]
    const [moved] = newQueue.splice(sourceQueueIndex, 1)
    const updatedItem: FlowQueueItem = {
      ...moved,
      blockId: targetBlockId,
      blockKey: targetBlockKey
    }

    // Find insertion point in the queue: after the Nth item of the target block
    let insertAt = 0
    let blockItemCount = 0
    for (let i = 0; i < newQueue.length; i++) {
      if (newQueue[i].blockId === targetBlockId) {
        blockItemCount++
        if (blockItemCount <= targetPosition) {
          insertAt = i + 1
        }
      }
    }
    // If no items in target block yet, insert after the last item of a preceding block
    if (blockItemCount === 0) {
      const targetBlockOrder = sortedBlocks.findIndex((b) => b.id === targetBlockId)
      for (let i = 0; i < newQueue.length; i++) {
        const itemBlockOrder = sortedBlocks.findIndex((b) => b.id === newQueue[i].blockId)
        if (itemBlockOrder <= targetBlockOrder) {
          insertAt = i + 1
        }
      }
    }

    newQueue.splice(insertAt, 0, updatedItem)

    // Recalculate currentIndex
    const movedIsActive = currentIndex >= 0 && sourceQueueIndex === currentIndex

    if (movedIsActive) {
      // Save elapsed time on the moved task and revert it to pending
      const elapsed = useFlowStore.getState().getTaskElapsedSeconds()
      const movedIdx = newQueue.findIndex(
        (q) => q.taskId === updatedItem.taskId && q.blockKey === updatedItem.blockKey
      )
      if (movedIdx >= 0) {
        newQueue[movedIdx] = {
          ...newQueue[movedIdx],
          status: 'pending',
          timeSpentSeconds: (newQueue[movedIdx].timeSpentSeconds || 0) + elapsed
        }
      }

      // Activate the next pending task (new top of queue)
      const nextPending = newQueue.findIndex((q) => q.status === 'pending')
      if (nextPending >= 0) {
        newQueue[nextPending] = { ...newQueue[nextPending], status: 'active' }
        const now = Date.now()
        useFlowStore.setState({
          queue: newQueue,
          currentIndex: nextPending,
          taskTimerStartedAt: useFlowStore.getState().phase === 'working' ? now : null,
          taskAccumulatedSeconds: 0
        })
      } else {
        useFlowStore.setState({ queue: newQueue, currentIndex: -1 })
      }
    } else {
      let newCurrentIndex = -1
      if (currentIndex >= 0) {
        const activeItem = queue[currentIndex]
        newCurrentIndex = newQueue.findIndex(
          (q) => q.taskId === activeItem.taskId && q.blockKey === activeItem.blockKey
        )
        if (newCurrentIndex === -1) {
          newCurrentIndex = newQueue.findIndex((q) => q.taskId === activeItem.taskId)
        }
      }

      useFlowStore.setState({
        queue: newQueue,
        ...(newCurrentIndex >= 0 ? { currentIndex: newCurrentIndex } : {})
      })
    }

    dragRef.current = null
    setDragQueueIndex(null)
    setDropTarget(null)
  }, [queue, currentIndex, date, moveTask, sortedBlocks])

  const handleDragEnd = useCallback(() => {
    dragRef.current = null
    setDragQueueIndex(null)
    setDropTarget(null)
  }, [])

  const handleToggleTask = useCallback(
    (blockKey: string, taskId: string) => {
      // Check if this is a linked task reference
      const isRef = taskRefs.some((r) => r.id === taskId)
      if (isRef) {
        toggleTaskRef(date, taskId)
      } else {
        toggleTask(blockKey, taskId)
      }
    },
    [toggleTask, toggleTaskRef, taskRefs, date]
  )

  // Add task per block
  const [addingToBlock, setAddingToBlock] = useState<string | null>(null)
  const [taskText, setTaskText] = useState('')
  const taskInputRef = useRef<HTMLInputElement>(null)

  const handleStartAddTask = useCallback((blockId: string) => {
    setAddingToBlock(blockId)
    setTaskText('')
    setTimeout(() => taskInputRef.current?.focus(), 50)
  }, [])

  const handleAddTask = useCallback(() => {
    const trimmed = taskText.trim()
    if (!trimmed || !addingToBlock) return

    const blockKey = `${date}__block__${addingToBlock}`
    addTask(blockKey, trimmed)

    const blockTasks = useTaskStore.getState().tasks[blockKey] || []
    const newTask = blockTasks[blockTasks.length - 1]
    if (newTask) {
      const flowState = useFlowStore.getState()
      const newQueue = [...flowState.queue]
      // Insert at end of this block's items in the queue
      let insertAt = newQueue.length
      for (let i = newQueue.length - 1; i >= 0; i--) {
        if (newQueue[i].blockId === addingToBlock) {
          insertAt = i + 1
          break
        }
      }
      newQueue.splice(insertAt, 0, {
        taskId: newTask.id,
        blockKey,
        blockId: addingToBlock,
        estimatedMinutes: null,
        timeSpentSeconds: 0,
        status: 'pending'
      })
      useFlowStore.setState({ queue: newQueue })
    }

    setTaskText('')
    setAddingToBlock(null)
  }, [taskText, addingToBlock, date, addTask])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-5 pt-2 pb-1.5 flex items-center justify-between">
        <span className="text-[10px] text-text-muted tabular-nums">
          {completed}/{total} {started ? 'concluídas' : 'tarefas'}
        </span>
      </div>

      {/* Block groups */}
      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <div className="flex flex-col gap-4">
          {blockGroups.map(({ block, items }) => {
            const blockColor = BLOCK_COLORS[block.color] || BLOCK_COLORS.indigo
            const isDropTargetBlock = dropTarget?.blockId === block.id
            const isActiveBlock = started && currentIndex >= 0 && queue[currentIndex]?.blockId === block.id
            const hasPendingTasks = items.some((i) => i.item.status === 'pending')
            const canJump = started && !isActiveBlock && hasPendingTasks

            return (
              <div
                key={block.id}
                className={`rounded-xl transition-all ${isDropTargetBlock ? 'ring-1 ring-white/20' : ''}`}
                style={{ backgroundColor: blockColor + '10' }}
                onDragOver={(e) => handleBlockDragOver(e, block.id)}
                onDrop={() => handleDrop(block.id, items.length)}
              >
                {/* Block header */}
                <div
                  className={`flex items-center justify-between px-3 pt-2.5 pb-1 ${canJump ? 'cursor-pointer hover:bg-white/5 rounded-t-xl transition-colors' : ''}`}
                  onClick={canJump ? () => jumpToBlock(block.id) : undefined}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: blockColor }}
                    />
                    <span className="text-xs font-medium truncate" style={{ color: blockColor }}>
                      {block.title}
                    </span>
                    <span className="text-[10px] text-text-muted/50 tabular-nums shrink-0">
                      {formatTime(block.startTime)}–{formatTime(block.endTime)}
                    </span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStartAddTask(block.id) }}
                    className="p-0.5 rounded hover:bg-white/10 transition-colors"
                    title="Adicionar tarefa"
                  >
                    <Plus size={12} style={{ color: blockColor + '80' }} />
                  </button>
                </div>

                {/* Add task input for this block */}
                {addingToBlock === block.id && (
                  <div className="px-3 pb-2">
                    <input
                      ref={taskInputRef}
                      type="text"
                      value={taskText}
                      onChange={(e) => setTaskText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddTask()
                        if (e.key === 'Escape') {
                          setAddingToBlock(null)
                          setTaskText('')
                        }
                      }}
                      onBlur={() => {
                        if (!taskText.trim()) {
                          setAddingToBlock(null)
                          setTaskText('')
                        }
                      }}
                      placeholder="Nova tarefa..."
                      className="w-full text-xs bg-white/10 border border-white/10 rounded-md px-2 py-1.5 text-text-primary placeholder:text-text-muted outline-none focus:border-white/20 transition-colors"
                      spellCheck={false}
                    />
                  </div>
                )}

                {/* Tasks */}
                <div className="flex flex-col gap-0.5 px-1.5 pb-1.5">
                  {items.length === 0 && (
                    <div className="px-2 py-3 text-center">
                      <span className="text-[10px] text-text-muted/30">Sem tarefas</span>
                    </div>
                  )}
                  {items.map(({ item, queueIndex }, positionInBlock) => {
                    const blockTasks = allTasks[item.blockKey] ?? EMPTY_TASKS
                    let task = blockTasks.find((t) => t.id === item.taskId)
                    // Resolve linked task references
                    const ref = !task ? taskRefs.find((r) => r.id === item.taskId) : null
                    const linkedTask = ref ? getResolvedTask(ref) : null
                    if (!task && linkedTask) task = linkedTask
                    if (!task && (item.status === 'completed' || item.status === 'skipped')) return null

                    const taskLabel = task?.text || 'Tarefa'
                    const isActive = queueIndex === currentIndex
                    const isCompleted = item.status === 'completed' || task?.completed
                    const isDragging = dragQueueIndex === queueIndex
                    const isDropHere =
                      dropTarget?.blockId === block.id && dropTarget.position === positionInBlock && dragQueueIndex !== null && !isDragging

                    // Countdown for active task (goes negative when exceeded)
                    let countdownLabel: string | null = null
                    let isOvertime = false
                    const elapsed = getTaskElapsed(queueIndex)
                    if (isActive && item.estimatedMinutes) {
                      const remainingSec = item.estimatedMinutes * 60 - elapsed
                      if (remainingSec >= 0) {
                        const remainingMin = Math.ceil(remainingSec / 60)
                        countdownLabel = formatEstimate(remainingMin)
                      } else {
                        const overtimeMin = Math.ceil(Math.abs(remainingSec) / 60)
                        countdownLabel = `-${formatEstimate(overtimeMin)}`
                        isOvertime = true
                      }
                    }

                    // BG opacity: 20% base, grows with time consumed
                    let bgOpacity = 0.20
                    if (isCompleted) {
                      bgOpacity = 0.06
                    } else if (elapsed > 0 && item.estimatedMinutes) {
                      const progress = Math.min(elapsed / (item.estimatedMinutes * 60), 1)
                      bgOpacity = 0.20 + progress * 0.50
                    } else if (elapsed > 0) {
                      bgOpacity = 0.30
                    }

                    return (
                      <div
                        key={`${item.blockId}-${item.taskId}`}
                        draggable={!isCompleted}
                        onDragStart={() => handleDragStart(queueIndex, block.id)}
                        onDragOver={(e) => handleTaskDragOver(e, block.id, positionInBlock)}
                        onDrop={(e) => { e.stopPropagation(); handleDrop(block.id, positionInBlock) }}
                        onDragEnd={handleDragEnd}
                        className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg transition-all ${
                          isCompleted ? 'opacity-40' : ''
                        } ${isDragging ? 'opacity-20' : ''} ${
                          isDropHere ? 'ring-1 ring-white/30' : ''
                        }`}
                        style={{
                          backgroundColor: blockColor + Math.round(bgOpacity * 255).toString(16).padStart(2, '0')
                        }}
                      >
                        {/* Drag handle */}
                        {!isCompleted && (
                          <div className="shrink-0 opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing transition-opacity">
                            <GripVertical size={12} />
                          </div>
                        )}

                        {/* Checkbox */}
                        <button
                          className="shrink-0"
                          onClick={() => handleToggleTask(item.blockKey, item.taskId)}
                        >
                          {isCompleted ? (
                            <Check size={16} className="text-white/80" />
                          ) : isActive ? (
                            <Circle
                              size={16}
                              className="text-white fill-white/30 hover:text-success hover:fill-success/20 cursor-pointer"
                            />
                          ) : (
                            <Circle
                              size={16}
                              className="text-white/60 hover:text-success hover:fill-success/20 cursor-pointer"
                            />
                          )}
                        </button>

                        {/* Task label */}
                        <span
                          className={`flex-1 text-sm truncate ${
                            isCompleted
                              ? 'line-through text-text-muted'
                              : isActive
                                ? 'text-text-primary font-medium'
                                : 'text-text-secondary'
                          }`}
                        >
                          {taskLabel}
                        </span>

                        {/* Countdown / estimate — clickable to edit */}
                        {editingEstimate?.queueIndex === queueIndex ? (
                          <input
                            ref={estimateInputRef}
                            type="text"
                            value={estimateInput}
                            onChange={(e) => setEstimateInput(e.target.value.replace(/[^0-9]/g, ''))}
                            onBlur={handleEstimateCommit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleEstimateCommit()
                              if (e.key === 'Escape') { setEditingEstimate(null); setEstimateInput('') }
                            }}
                            placeholder="min"
                            className="w-12 text-[11px] text-center bg-white/10 border border-white/20 rounded px-1 py-0.5 outline-none tabular-nums text-text-primary"
                            maxLength={4}
                          />
                        ) : isActive && countdownLabel ? (
                          <button
                            onClick={() => handleEstimateClick(queueIndex, item.blockKey, item.taskId, item.estimatedMinutes)}
                            className={`shrink-0 text-xs tabular-nums font-medium cursor-pointer hover:opacity-70 ${
                              isOvertime ? 'text-error' : 'text-text-primary'
                            }`}
                          >
                            {countdownLabel}
                          </button>
                        ) : !isCompleted ? (
                          <button
                            onClick={() => handleEstimateClick(queueIndex, item.blockKey, item.taskId, item.estimatedMinutes)}
                            className={`shrink-0 tabular-nums cursor-pointer hover:opacity-70 ${
                              item.estimatedMinutes ? 'text-[10px] text-text-secondary' : 'text-[10px] text-text-muted/30 hover:text-text-muted/60'
                            }`}
                          >
                            {item.estimatedMinutes
                              ? item.timeSpentSeconds > 0
                                ? formatEstimate(Math.max(1, Math.ceil(item.estimatedMinutes - item.timeSpentSeconds / 60)))
                                : formatEstimate(item.estimatedMinutes)
                              : '+ tempo'}
                          </button>
                        ) : isCompleted && item.timeSpentSeconds > 0 ? (
                          <span className="shrink-0 text-[10px] text-text-muted tabular-nums">
                            {item.timeSpentSeconds < 60
                              ? `${item.timeSpentSeconds}s`
                              : item.timeSpentSeconds < 3600
                                ? `${Math.round(item.timeSpentSeconds / 60)}m`
                                : `${Math.floor(item.timeSpentSeconds / 3600)}h${Math.round((item.timeSpentSeconds % 3600) / 60)}m`}
                          </span>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
