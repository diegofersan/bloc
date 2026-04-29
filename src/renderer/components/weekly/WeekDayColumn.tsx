import { useMemo, useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO, isToday } from 'date-fns'
import { pt } from 'date-fns/locale'
import { Plus, CalendarSync, Circle, Check, X } from 'lucide-react'
import { useTimeBlockStore, type TimeBlock, type TimeBlockColor } from '../../stores/timeBlockStore'
import { useTaskStore, type Task, type TaskRef } from '../../stores/taskStore'
import { useWeeklyPlanningUiStore } from '../../stores/weeklyPlanningUiStore'
import QuickBlockModal from './QuickBlockModal'

/** Hex map matching FlowQueueView so colours are coherent across views. */
const BLOCK_HEX: Record<TimeBlockColor, string> = {
  indigo: '#6366f1',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  sky: '#0ea5e9',
  violet: '#8b5cf6',
  slate: '#64748b'
}

function formatHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function findInList(list: Task[], taskId: string): Task | null {
  for (const t of list) {
    if (t.id === taskId) return t
    if (t.subtasks.length > 0) {
      const r = findInList(t.subtasks, taskId)
      if (r) return r
    }
  }
  return null
}

/** For a ref, locate its origin task's parent blockId by scanning the origin's storeKeys. */
function originBlockIdFor(
  ref: TaskRef,
  tasksAll: Record<string, Task[]>
): string | null {
  const prefix = `${ref.originDate}__block__`
  for (const [key, list] of Object.entries(tasksAll)) {
    if (!key.startsWith(prefix)) continue
    if (findInList(list, ref.originTaskId)) return key.slice(prefix.length)
  }
  return null
}

function resolveBlockMeta(
  blockId: string,
  blocksByDate: Record<string, TimeBlock[]>
): { title: string; color: TimeBlockColor } {
  for (const list of Object.values(blocksByDate)) {
    const m = list.find((b) => b.id === blockId)
    if (m) return { title: m.title || 'Sem título', color: m.color }
  }
  return { title: blockId, color: 'slate' }
}

interface Props {
  date: string
}

export default function WeekDayColumn({ date }: Props) {
  const navigate = useNavigate()
  const dayBlocksRaw = useTimeBlockStore((s) => s.blocks[date])
  const allBlocks = useTimeBlockStore((s) => s.blocks)
  const addBlock = useTimeBlockStore((s) => s.addBlock)
  const deferBlock = useTimeBlockStore((s) => s.deferBlock)
  const tasks = useTaskStore((s) => s.tasks)
  const taskRefs = useTaskStore((s) => s.taskRefs)
  const addTask = useTaskStore((s) => s.addTask)
  const moveTask = useTaskStore((s) => s.moveTask)
  const moveBlockTasks = useTaskStore((s) => s.moveBlockTasks)
  const createTaskRef = useTaskStore((s) => s.createTaskRef)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const toggleTaskRef = useTaskStore((s) => s.toggleTaskRef)
  const removeTask = useTaskStore((s) => s.removeTask)
  const removeTaskRef = useTaskStore((s) => s.removeTaskRef)

  const dragKind = useWeeklyPlanningUiStore((s) => s.dragKind)
  const dragOriginDate = useWeeklyPlanningUiStore((s) => s.draggingOriginDate)
  const dragOriginBlockId = useWeeklyPlanningUiStore((s) => s.draggingOriginBlockId)
  const dragTaskId = useWeeklyPlanningUiStore((s) => s.draggingTaskId)
  const dragBlockId = useWeeklyPlanningUiStore((s) => s.draggingBlockId)
  const startTaskDrag = useWeeklyPlanningUiStore((s) => s.startTaskDrag)
  const startBlockDrag = useWeeklyPlanningUiStore((s) => s.startBlockDrag)
  const endDrag = useWeeklyPlanningUiStore((s) => s.endDrag)

  const [showBlockModal, setShowBlockModal] = useState(false)
  const [addingToBlock, setAddingToBlock] = useState<string | null>(null)
  const [taskText, setTaskText] = useState('')
  const taskInputRef = useRef<HTMLInputElement>(null)
  const [columnDragOver, setColumnDragOver] = useState(false)
  const [hoverBlockId, setHoverBlockId] = useState<string | null>(null)

  useEffect(() => {
    if (addingToBlock) setTimeout(() => taskInputRef.current?.focus(), 30)
  }, [addingToBlock])

  const sortedDayBlocks = useMemo(() => {
    return [...(dayBlocksRaw ?? [])].sort((a, b) => a.startTime - b.startTime)
  }, [dayBlocksRaw])

  const dayBlockIds = useMemo(() => new Set(sortedDayBlocks.map((b) => b.id)), [sortedDayBlocks])

  const refsForDay = taskRefs[date] ?? []

  const grouped = useMemo(() => {
    const ownByBlock = new Map<string, TaskRef[]>()
    const foreignByBlock = new Map<string, TaskRef[]>()
    const unbranched: TaskRef[] = []
    for (const r of refsForDay) {
      const blockId = originBlockIdFor(r, tasks)
      if (!blockId) unbranched.push(r)
      else if (dayBlockIds.has(blockId)) {
        const arr = ownByBlock.get(blockId) ?? []
        arr.push(r)
        ownByBlock.set(blockId, arr)
      } else {
        const arr = foreignByBlock.get(blockId) ?? []
        arr.push(r)
        foreignByBlock.set(blockId, arr)
      }
    }
    return { ownByBlock, foreignByBlock, unbranched }
  }, [refsForDay, tasks, dayBlockIds])

  const dateLevelTasks = tasks[date] ?? []

  const today = isToday(parseISO(date))
  const dayName = format(parseISO(date), 'EEE', { locale: pt })
  const dayNum = format(parseISO(date), 'd MMM', { locale: pt })

  // -------- Drag/drop helpers --------

  /** Whether the current drag operation is "active" (any kind in flight). */
  const isDragging = dragKind !== null

  function isAcceptableForBlock(): boolean {
    return dragKind === 'pending' || dragKind === 'task'
  }

  function handleColumnDragOver(e: React.DragEvent) {
    if (!isDragging) return
    e.preventDefault()
    e.dataTransfer.dropEffect = dragKind === 'pending' ? 'copy' : 'move'
    if (!columnDragOver) setColumnDragOver(true)
  }

  function handleColumnDragLeave() {
    setColumnDragOver(false)
  }

  function handleColumnDrop(e: React.DragEvent) {
    e.preventDefault()
    setColumnDragOver(false)
    setHoverBlockId(null)
    if (!isDragging) return

    if (dragKind === 'pending' && dragTaskId && dragOriginDate) {
      if (dragOriginDate !== date) {
        createTaskRef(dragOriginDate, dragTaskId, date)
      }
    } else if (dragKind === 'task' && dragTaskId && dragOriginDate) {
      // Move to date-level (no block) on this day.
      const fromKey = dragOriginBlockId
        ? `${dragOriginDate}__block__${dragOriginBlockId}`
        : dragOriginDate
      const toKey = date
      if (fromKey !== toKey) moveTask(fromKey, toKey, dragTaskId)
    } else if (dragKind === 'block' && dragBlockId && dragOriginDate) {
      if (dragOriginDate !== date) {
        deferBlock(dragOriginDate, dragBlockId, date)
        moveBlockTasks(dragOriginDate, dragBlockId, date)
      }
    }
    endDrag()
  }

  function handleBlockDragOver(e: React.DragEvent, blockId: string) {
    if (!isAcceptableForBlock()) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = dragKind === 'pending' ? 'copy' : 'move'
    if (hoverBlockId !== blockId) setHoverBlockId(blockId)
  }

  function handleBlockDrop(e: React.DragEvent, blockId: string) {
    e.preventDefault()
    e.stopPropagation()
    setHoverBlockId(null)
    setColumnDragOver(false)
    if (!isDragging) return
    if (dragKind === 'pending' && dragTaskId && dragOriginDate) {
      // No native "ref-into-specific-block" model — just create a ref into the day.
      // The ref will visually attach to the origin's block; if it happens to be
      // the same block id, it groups under that card automatically.
      if (dragOriginDate !== date) {
        createTaskRef(dragOriginDate, dragTaskId, date)
      }
    } else if (dragKind === 'task' && dragTaskId && dragOriginDate) {
      const fromKey = dragOriginBlockId
        ? `${dragOriginDate}__block__${dragOriginBlockId}`
        : dragOriginDate
      const toKey = `${date}__block__${blockId}`
      if (fromKey !== toKey) moveTask(fromKey, toKey, dragTaskId)
    }
    endDrag()
  }

  // -------- Add task --------

  function handleStartAddTask(blockId: string) {
    setAddingToBlock(blockId)
    setTaskText('')
  }

  function commitAddTask() {
    const text = taskText.trim()
    if (!text || !addingToBlock) {
      setAddingToBlock(null)
      setTaskText('')
      return
    }
    addTask(`${date}__block__${addingToBlock}`, text)
    setAddingToBlock(null)
    setTaskText('')
  }

  function handleAddBlock(b: { title: string; startTime: number; endTime: number; color: TimeBlockColor }) {
    addBlock(date, { ...b, date })
  }

  // -------- Render helpers --------

  function renderTaskRow(t: Task, blockKey: string, originBlockIdForDrag: string | null) {
    return (
      <div
        key={`task-${t.id}`}
        draggable
        onDragStart={(e) => {
          e.stopPropagation()
          startTaskDrag(date, originBlockIdForDrag, t.id)
        }}
        onDragEnd={endDrag}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-[12px] cursor-grab active:cursor-grabbing group hover:bg-black/5"
        title={t.text}
      >
        <button
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            toggleTask(blockKey, t.id)
          }}
        >
          {t.completed ? (
            <Check size={12} className="text-text-muted" />
          ) : (
            <Circle size={12} className="text-text-muted/60 hover:text-text-secondary" />
          )}
        </button>
        <span
          className={`flex-1 truncate ${
            t.completed
              ? 'line-through text-text-muted'
              : t.wontDo
                ? 'line-through text-text-muted/70 italic'
                : 'text-text-primary'
          }`}
        >
          {t.text}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            removeTask(blockKey, t.id)
          }}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
          title="Remover"
        >
          <X size={11} className="text-text-muted hover:text-error" />
        </button>
      </div>
    )
  }

  function renderRefRow(r: TaskRef) {
    return (
      <div
        key={`ref-${r.id}`}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-[12px] text-text-secondary group hover:bg-black/5"
        title={r.titleSnapshot}
      >
        <button
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            toggleTaskRef(date, r.id)
          }}
        >
          <Circle size={12} className="text-text-muted/60 hover:text-text-secondary" />
        </button>
        <span className="flex-1 truncate">{r.titleSnapshot ?? '(sem título)'}</span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            removeTaskRef(date, r.id)
          }}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
          title="Remover referência"
        >
          <X size={11} className="text-text-muted hover:text-error" />
        </button>
      </div>
    )
  }

  return (
    <div
      className={`relative flex flex-col h-full min-w-0 border-r border-border last:border-r-0 transition-colors ${
        columnDragOver && !hoverBlockId ? 'bg-accent/5' : ''
      }`}
      onDragOver={handleColumnDragOver}
      onDragLeave={handleColumnDragLeave}
      onDrop={handleColumnDrop}
    >
      {/* Header */}
      <button
        onClick={() => navigate(`/day/${date}`)}
        className="shrink-0 px-2 py-2 border-b border-border text-left hover:bg-bg-hover transition-colors"
        title="Abrir dia"
      >
        <div className="flex items-baseline gap-1.5">
          <span className={`text-xs uppercase font-medium tracking-wide ${today ? 'text-accent' : 'text-text-muted'}`}>
            {dayName}
          </span>
          {today && (
            <span className="text-[10px] uppercase tracking-wider text-accent">hoje</span>
          )}
        </div>
        <div className="text-sm font-medium text-text-primary">{dayNum}</div>
      </button>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-2">
        {sortedDayBlocks.length === 0 &&
          grouped.foreignByBlock.size === 0 &&
          grouped.unbranched.length === 0 &&
          dateLevelTasks.length === 0 && (
            <div className="text-[11px] text-text-muted/60 text-center pt-4">Sem blocos</div>
          )}



        {/* Day-scheduled blocks: Flow-style card */}
        {sortedDayBlocks.map((b) => {
          const blockKey = `${date}__block__${b.id}`
          const blockTasks = tasks[blockKey] ?? []
          const ownRefs = grouped.ownByBlock.get(b.id) ?? []
          const hex = BLOCK_HEX[b.color]
          const isHover = hoverBlockId === b.id && isAcceptableForBlock()
          return (
            <div
              key={b.id}
              draggable
              onDragStart={(e) => {
                e.stopPropagation()
                startBlockDrag(date, b.id)
              }}
              onDragEnd={endDrag}
              onDragOver={(e) => handleBlockDragOver(e, b.id)}
              onDrop={(e) => handleBlockDrop(e, b.id)}
              className={`rounded-lg transition-all cursor-grab active:cursor-grabbing ${
                isHover ? 'ring-1 ring-accent' : ''
              }`}
              style={{ backgroundColor: `${hex}1A` /* ~10% */ }}
            >
              {/* Block header */}
              <div className="flex items-center justify-between px-2 pt-1.5 pb-1 gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: hex }} />
                  <span className="text-[11px] font-medium truncate" style={{ color: hex }}>
                    {b.title || 'Sem título'}
                  </span>
                  <span className="text-[10px] text-text-muted/60 tabular-nums shrink-0">
                    {formatHHMM(b.startTime)}–{formatHHMM(b.endTime)}
                  </span>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {b.googleEventId && (
                    <CalendarSync size={10} className="opacity-40" />
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleStartAddTask(b.id)
                    }}
                    className="p-0.5 rounded hover:bg-black/5 transition-colors"
                    title="Adicionar tarefa"
                  >
                    <Plus size={11} style={{ color: hex }} />
                  </button>
                </div>
              </div>

              {/* Add task input */}
              {addingToBlock === b.id && (
                <div className="px-2 pb-1.5">
                  <input
                    ref={taskInputRef}
                    type="text"
                    value={taskText}
                    onChange={(e) => setTaskText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitAddTask()
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
                    placeholder="Nova tarefa…"
                    className="w-full text-[11px] bg-white/40 border border-black/10 rounded px-1.5 py-1 text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
                  />
                </div>
              )}

              {/* Tasks + refs */}
              {(blockTasks.length > 0 || ownRefs.length > 0) && (
                <div className="px-1 pb-1 space-y-0">
                  {blockTasks.map((t) => renderTaskRow(t, blockKey, b.id))}
                  {ownRefs.map((r) => renderRefRow(r))}
                </div>
              )}
            </div>
          )
        })}

        {/* Foreign blocks */}
        {[...grouped.foreignByBlock.entries()].map(([blockId, refs]) => {
          const meta = resolveBlockMeta(blockId, allBlocks)
          const hex = BLOCK_HEX[meta.color]
          return (
            <div
              key={`foreign-${blockId}`}
              className="rounded-lg"
              style={{ backgroundColor: `${hex}10` }}
            >
              <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: hex }} />
                <span className="text-[11px] font-medium truncate" style={{ color: hex }}>
                  {meta.title}
                </span>
              </div>
              <div className="px-1 pb-1">{refs.map((r) => renderRefRow(r))}</div>
            </div>
          )
        })}

        {/* + Add block placeholder — always visible at end of body */}
        <button
          onClick={() => setShowBlockModal(true)}
          className="w-full flex items-center justify-center gap-1 px-2 py-2 rounded-lg border border-dashed border-border text-[11px] text-text-muted hover:text-accent hover:border-accent hover:bg-accent/5 transition-colors"
        >
          <Plus size={11} /> Adicionar bloco
        </button>

        {/* Bloco indefinido — legacy data: date-level tasks + refs without block.
            Read-only here (no add): all new tasks must belong to a block. */}
        {(() => {
          const undefinedHex = BLOCK_HEX.slate
          const showUndefined = dateLevelTasks.length > 0 || grouped.unbranched.length > 0
          if (!showUndefined) return null
          return (
            <div className="rounded-lg" style={{ backgroundColor: `${undefinedHex}1A` }}>
              <div className="flex items-center px-2 pt-1.5 pb-1 gap-1.5">
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0 border border-dashed"
                  style={{ borderColor: undefinedHex }}
                />
                <span
                  className="text-[11px] font-medium truncate"
                  style={{ color: undefinedHex }}
                  title="Tarefas legadas sem bloco — arrasta para um bloco para processar"
                >
                  Bloco indefinido
                </span>
              </div>
              <div className="px-1 pb-1 space-y-0">
                {dateLevelTasks.map((t) => renderTaskRow(t, date, null))}
                {grouped.unbranched.map((r) => renderRefRow(r))}
              </div>
            </div>
          )
        })()}
      </div>

      <QuickBlockModal
        open={showBlockModal}
        onClose={() => setShowBlockModal(false)}
        onCreate={handleAddBlock}
      />
    </div>
  )
}
