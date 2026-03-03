import { useState, useRef, useEffect } from 'react'
import { Sparkles, X, Loader2, Move, Copy, Plus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTaskStore, type Task } from '../stores/taskStore'
import { useClipboardStore } from '../stores/clipboardStore'
import { useSettingsStore } from '../stores/settingsStore'
import { expandTaskV2 } from '../services/expansionPipeline'

interface EditableTaskRowProps {
  task: Task
  date: string
  depth?: number
  index?: number
  isFocused: boolean
  activeTaskId?: string | null
  onFocus: () => void
  onCreateBelow: () => void
  onDeleteAndFocusAbove: () => void
  onArrowUp: () => void
  onArrowDown: () => void
  onSubtaskFocus?: (id: string) => void
  onSubtaskCreateBelow?: (id: string) => void
  onSubtaskDeleteAndFocusAbove?: (id: string) => void
  onSubtaskArrowUp?: (id: string) => void
  onSubtaskArrowDown?: (id: string) => void
  onBlurCleanup?: (taskId: string, text: string) => void
  onIndent?: () => void
  onAddSubtask?: () => void
}

export default function EditableTaskRow({
  task,
  date,
  depth = 0,
  index = 0,
  isFocused,
  activeTaskId,
  onFocus,
  onCreateBelow,
  onDeleteAndFocusAbove,
  onArrowUp,
  onArrowDown,
  onSubtaskFocus,
  onSubtaskCreateBelow,
  onSubtaskDeleteAndFocusAbove,
  onSubtaskArrowUp,
  onSubtaskArrowDown,
  onBlurCleanup,
  onIndent,
  onAddSubtask
}: EditableTaskRowProps) {
  const { toggleTask, removeTask, updateTaskText, addSubtasks, setTaskExpanding } = useTaskStore()
  const { provider, apiKey, model, isConfigured } = useSettingsStore()
  const clipboardTaskId = useClipboardStore((s) => s.taskId)
  const clipboardMode = useClipboardStore((s) => s.mode)
  const setClipboard = useClipboardStore((s) => s.setClipboard)
  const isInClipboard = clipboardTaskId === task.id
  const [hovered, setHovered] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localText, setLocalText] = useState(task.text)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLocalText(task.text)
  }, [task.text])

  useEffect(() => {
    if (isFocused) {
      inputRef.current?.focus()
    }
  }, [isFocused])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      updateTaskText(date, task.id, localText)
      onCreateBelow()
    } else if (e.key === 'Backspace' && localText === '') {
      e.preventDefault()
      onDeleteAndFocusAbove()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      onArrowUp()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      onArrowDown()
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      if (onIndent) {
        updateTaskText(date, task.id, localText)
        onIndent()
      }
    } else if (e.key === 'Escape') {
      inputRef.current?.blur()
    }
  }

  function handleBlur() {
    if (localText !== task.text) {
      updateTaskText(date, task.id, localText)
    }
    onBlurCleanup?.(task.id, localText)
  }

  async function handleExpand() {
    if (task.isExpanding) return
    if (!isConfigured()) {
      setError('Configure o fornecedor de IA nas Definições')
      setTimeout(() => setError(null), 3000)
      return
    }
    setError(null)
    setTaskExpanding(date, task.id, true)
    try {
      const results = await expandTaskV2(task.text, date, task.id, provider, apiKey, model)
      addSubtasks(date, task.id, results.map(r => r.text))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao expandir tarefa'
      setError(message)
      setTimeout(() => setError(null), 5000)
    } finally {
      setTaskExpanding(date, task.id, false)
    }
  }

  const iconSize = depth > 0 ? 14 : 16
  const completedCount = task.subtasks.filter(s => s.completed).length
  const hasSubtasks = task.subtasks.length > 0
  const allSubtasksDone = hasSubtasks && task.subtasks.every(s => s.completed)
  const suggestComplete = allSubtasksDone && !task.completed

  return (
    <motion.div
      role="listitem"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16, transition: { duration: 0.15 } }}
      transition={{ delay: index * 0.05 }}
      layout
    >
      <div
        className={`task-row group flex items-center gap-3 py-2.5${isInClipboard && clipboardMode === 'move' ? ' opacity-40' : ''}${isInClipboard && clipboardMode === 'copy' ? ' border-l-2 border-dashed border-ai' : ''}`}
        style={{ paddingLeft: `${depth * 24 + 8}px`, paddingRight: '8px' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <button
          onClick={() => toggleTask(date, task.id)}
          role="checkbox"
          aria-checked={task.completed}
          aria-label="Marcar como concluída"
          className={`shrink-0 w-4 h-4 ${depth > 0 ? 'rounded-sm' : 'rounded-full'} border-[1.5px] flex items-center justify-center transition-all ${
            task.completed
              ? 'bg-success border-success opacity-100'
              : suggestComplete
                ? 'border-success opacity-100 animate-pulse'
                : hovered || isFocused
                  ? 'border-border-light opacity-100'
                  : 'border-border opacity-40'
          }`}
        >
          {task.completed && (
            <motion.svg
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              aria-hidden="true"
              width="8"
              height="8"
              viewBox="0 0 12 12"
              fill="none"
            >
              <path
                d="M2 6L5 9L10 3"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.svg>
          )}
        </button>

        {hasSubtasks && (
          <span className={`text-xs tabular-nums ${suggestComplete ? 'text-success font-medium' : 'text-text-muted'}`} aria-label={`${completedCount} de ${task.subtasks.length} subtarefas concluídas`}>
            {completedCount}/{task.subtasks.length}
          </span>
        )}

        <input
          ref={inputRef}
          type="text"
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onBlur={handleBlur}
          aria-label="Editar tarefa"
          className={`task-editor-input flex-1 text-sm bg-transparent border-none outline-none ${
            task.completed ? 'line-through text-text-muted' : 'text-text-primary'
          }`}
          spellCheck={false}
        />

        <div className={`flex items-center gap-0.5 transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'} group-focus-within:opacity-100`}>
          {depth === 0 && !isInClipboard && (
            <>
              <button
                onClick={() => setClipboard(task, date, 'move')}
                aria-label="Mover tarefa"
                className="shrink-0 p-1 rounded hover:bg-bg-tertiary transition-colors"
              >
                <Move size={iconSize} className="text-text-muted hover:text-text-secondary transition-colors" aria-hidden="true" />
              </button>
              <button
                onClick={() => setClipboard(task, date, 'copy')}
                aria-label="Copiar tarefa"
                className="shrink-0 p-1 rounded hover:bg-bg-tertiary transition-colors"
              >
                <Copy size={iconSize} className="text-text-muted hover:text-text-secondary transition-colors" aria-hidden="true" />
              </button>
            </>
          )}

          {onAddSubtask && (
            <button
              onClick={onAddSubtask}
              aria-label="Adicionar subtarefa"
              className="shrink-0 p-1 rounded hover:bg-bg-tertiary transition-colors"
            >
              <Plus size={iconSize} className="text-text-muted hover:text-text-secondary transition-colors" aria-hidden="true" />
            </button>
          )}

          <button
            onClick={handleExpand}
            disabled={task.isExpanding}
            aria-label="Expandir com IA"
            className="shrink-0 p-1 rounded hover:bg-bg-tertiary transition-colors"
          >
            {task.isExpanding ? (
              <Loader2 size={iconSize} className="text-ai animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles size={iconSize} className="text-ai hover:text-ai-hover transition-colors" aria-hidden="true" />
            )}
          </button>

          <button
            onClick={() => removeTask(date, task.id)}
            aria-label="Eliminar tarefa"
            className="shrink-0 p-1 rounded hover:bg-bg-tertiary transition-colors"
          >
            <X size={iconSize} className="text-text-muted hover:text-text-secondary transition-colors" aria-hidden="true" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            role="alert"
            className="text-xs text-red-400 px-3 pb-1"
            style={{ paddingLeft: `${depth * 24 + 36}px` }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative" aria-expanded={hasSubtasks ? true : undefined}>
        {hasSubtasks && (
          <div
            className="absolute top-0 bottom-0 w-px bg-border"
            style={{ left: `${depth * 24 + 16}px` }}
          />
        )}
        <AnimatePresence>
          {task.subtasks.map((subtask, i) => (
            <EditableTaskRow
              key={subtask.id}
              task={subtask}
              date={date}
              depth={depth + 1}
              index={i}
              isFocused={activeTaskId === subtask.id}
              activeTaskId={activeTaskId}
              onFocus={() => onSubtaskFocus?.(subtask.id)}
              onCreateBelow={() => onSubtaskCreateBelow?.(subtask.id)}
              onDeleteAndFocusAbove={() => onSubtaskDeleteAndFocusAbove?.(subtask.id)}
              onArrowUp={() => onSubtaskArrowUp?.(subtask.id)}
              onArrowDown={() => onSubtaskArrowDown?.(subtask.id)}
              onSubtaskFocus={onSubtaskFocus}
              onSubtaskCreateBelow={onSubtaskCreateBelow}
              onSubtaskDeleteAndFocusAbove={onSubtaskDeleteAndFocusAbove}
              onSubtaskArrowUp={onSubtaskArrowUp}
              onSubtaskArrowDown={onSubtaskArrowDown}
              onBlurCleanup={onBlurCleanup}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
