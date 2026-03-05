import { useState, useRef, useEffect } from 'react'
import { Sparkles, X, Loader2, Plus, CalendarClock, Link2, ListPlus } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pt } from 'date-fns/locale'
import { motion, AnimatePresence } from 'framer-motion'
import { useTaskStore, type Task } from '../stores/taskStore'
import { useSettingsStore } from '../stores/settingsStore'
import { expandTaskV2 } from '../services/expansionPipeline'
import DeferTaskModal from './DeferTaskModal'

const MAX_DEPTH = 2

/** Strip common list prefixes: "1. ", "1) ", "- ", "* ", "• ", "[ ] ", "[x] " */
function stripListPrefix(line: string): string {
  return line.replace(/^(\d+[\.\)]\s+|[-•\*]\s+|\[[ xX]\]\s+)/, '').trim()
}

/** Detect list items from pasted text — tries newlines, numbered, then bullet patterns */
function detectListItems(text: string): string[] | null {
  // 1. Split by newlines (handles \n, \r\n, \r)
  const byNewline = text.split(/\r?\n|\r/).map(l => l.trim()).filter(l => l.length > 0)
  if (byNewline.length > 1) return byNewline.map(stripListPrefix).filter(l => l.length > 0)

  // 2. Numbered list on single line: "1. foo 2. bar 3. baz"
  const numbered = text.split(/(?=\d+[\.\)]\s)/).map(l => l.trim()).filter(l => l.length > 0)
  if (numbered.length > 1) return numbered.map(stripListPrefix).filter(l => l.length > 0)

  // 3. Bullet list on single line: "- foo - bar" or "• foo • bar"
  const bulleted = text.split(/(?=[-•\*]\s)/).map(l => l.trim()).filter(l => l.length > 0)
  if (bulleted.length > 1) return bulleted.map(stripListPrefix).filter(l => l.length > 0)

  return null
}

interface EditableTaskRowProps {
  task: Task
  date: string
  depth?: number
  index?: number
  isFocused: boolean
  activeTaskId?: string | null
  onFocus: () => void
  onCreateBelow: (text?: string) => void
  onDeleteAndFocusAbove: () => void
  onArrowUp: () => void
  onArrowDown: () => void
  onSubtaskFocus?: (id: string) => void
  onSubtaskCreateBelow?: (id: string, text?: string) => void
  onSubtaskDeleteAndFocusAbove?: (id: string) => void
  onSubtaskArrowUp?: (id: string) => void
  onSubtaskArrowDown?: (id: string) => void
  onBlurCleanup?: (taskId: string, text: string) => void
  onIndent?: () => void
  onAddSubtask?: () => void
  onSubtaskAddSubtask?: (id: string) => void
  onUnindent?: () => void
  onSubtaskUnindent?: (id: string) => void
  isLinked?: boolean
  onUnlink?: () => void
  onBreakOut?: (subtaskId: string) => void
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
  onAddSubtask,
  onSubtaskAddSubtask,
  onUnindent,
  onSubtaskUnindent,
  isLinked,
  onUnlink,
  onBreakOut
}: EditableTaskRowProps) {
  const { toggleTask, removeTask, updateTaskText, addSubtasks, setTaskExpanding } = useTaskStore()
  const { provider, apiKey, model, isConfigured } = useSettingsStore()
  const [hovered, setHovered] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localText, setLocalText] = useState(task.text)
  const [deferModalOpen, setDeferModalOpen] = useState(false)
  const [pasteLines, setPasteLines] = useState<string[] | null>(null)
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
      if (localText === '' && depth > 0 && task.subtasks.length === 0 && onBreakOut) {
        onBreakOut(task.id)
        return
      }
      if (localText === '' && depth === 0) return
      if (localText === '' && task.subtasks.length > 0) return
      const cursorPos = e.currentTarget.selectionStart ?? localText.length
      if (cursorPos < localText.length) {
        const leftPart = localText.substring(0, cursorPos)
        const rightPart = localText.substring(cursorPos).trim()
        setLocalText(leftPart)
        updateTaskText(date, task.id, leftPart)
        onCreateBelow(rightPart)
      } else {
        updateTaskText(date, task.id, localText)
        onCreateBelow()
      }
    } else if (e.key === 'Backspace' && localText === '') {
      e.preventDefault()
      if (task.subtasks.length > 0) return
      onDeleteAndFocusAbove()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      onArrowUp()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      onArrowDown()
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      if (depth > 0) {
        if (localText.trim() === '') {
          onDeleteAndFocusAbove()
        } else if (onUnindent) {
          updateTaskText(date, task.id, localText)
          onUnindent()
        }
      }
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      if (localText.trim() !== '' && onAddSubtask && depth < MAX_DEPTH) {
        updateTaskText(date, task.id, localText)
        onAddSubtask()
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

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text/plain')
    const items = detectListItems(text)
    if (items && items.length > 1) {
      e.preventDefault()
      setPasteLines(items)
    }
  }

  function handleConfirmPaste() {
    if (!pasteLines) return
    addSubtasks(date, task.id, pasteLines)
    setPasteLines(null)
  }

  function handleCancelPaste() {
    if (!pasteLines) return
    const joined = pasteLines.join(' ')
    setLocalText(joined)
    updateTaskText(date, task.id, joined)
    setPasteLines(null)
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

  const isInsideBlock = date.includes('__block__')
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
        className="task-row group flex items-center gap-3 py-2.5"
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

        {isLinked && depth === 0 && (
          <Link2 size={10} className="shrink-0 text-text-muted/40" aria-hidden="true" />
        )}

        <input
          ref={inputRef}
          type="text"
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={onFocus}
          onBlur={handleBlur}
          aria-label="Editar tarefa"
          className={`task-editor-input flex-1 text-sm bg-transparent border-none outline-none ${
            task.completed ? 'line-through text-text-muted' : 'text-text-primary'
          }`}
          spellCheck={false}
        />

        <div className={`flex items-center gap-0.5 transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'} group-focus-within:opacity-100`}>
          {depth === 0 && !task.completed && !isLinked && !isInsideBlock && (
            <button
              onClick={() => setDeferModalOpen(true)}
              aria-label="Adiar tarefa"
              className="shrink-0 p-1 rounded hover:bg-bg-tertiary transition-colors"
            >
              <CalendarClock size={iconSize} className="text-text-muted hover:text-text-secondary transition-colors" aria-hidden="true" />
            </button>
          )}

          {onAddSubtask && !isInsideBlock && depth < MAX_DEPTH && (
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
            onClick={() => onUnlink ? onUnlink() : removeTask(date, task.id)}
            aria-label={onUnlink ? "Desassociar tarefa" : "Eliminar tarefa"}
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
              onCreateBelow={(text?: string) => onSubtaskCreateBelow?.(subtask.id, text)}
              onDeleteAndFocusAbove={() => onSubtaskDeleteAndFocusAbove?.(subtask.id)}
              onArrowUp={() => onSubtaskArrowUp?.(subtask.id)}
              onArrowDown={() => onSubtaskArrowDown?.(subtask.id)}
              onSubtaskFocus={onSubtaskFocus}
              onSubtaskCreateBelow={onSubtaskCreateBelow}
              onSubtaskDeleteAndFocusAbove={onSubtaskDeleteAndFocusAbove}
              onSubtaskArrowUp={onSubtaskArrowUp}
              onSubtaskArrowDown={onSubtaskArrowDown}
              onBlurCleanup={onBlurCleanup}
              onBreakOut={onBreakOut}
              onAddSubtask={depth + 1 < MAX_DEPTH ? () => onSubtaskAddSubtask?.(subtask.id) : undefined}
              onSubtaskAddSubtask={onSubtaskAddSubtask}
              onUnindent={() => onSubtaskUnindent?.(subtask.id)}
              onSubtaskUnindent={onSubtaskUnindent}
            />
          ))}
        </AnimatePresence>
      </div>

      <DeferTaskModal
        isOpen={deferModalOpen}
        onClose={() => setDeferModalOpen(false)}
        taskId={task.id}
        originDate={date}
      />

      {pasteLines && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={handleCancelPaste}>
          <div className="bg-bg-primary border border-border rounded-xl shadow-lg w-80 max-h-[60vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <ListPlus size={16} className="text-text-secondary shrink-0" />
              <h3 className="text-sm font-medium text-text-primary">
                Criar {pasteLines.length} subtarefas?
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2">
              <ul className="space-y-1">
                {pasteLines.map((line, i) => (
                  <li key={i} className="text-xs text-text-secondary truncate">
                    • {line}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2 px-4 py-3 border-t border-border">
              <button
                onClick={handleCancelPaste}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-border text-text-secondary hover:bg-bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmPaste}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
              >
                Criar subtarefas
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}
