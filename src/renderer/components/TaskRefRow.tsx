import { useState } from 'react'
import { Link2, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { format, parseISO } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useTaskStore, type TaskRef } from '../stores/taskStore'

interface TaskRefRowProps {
  taskRef: TaskRef
  dateKey: string
}

export default function TaskRefRow({ taskRef, dateKey }: TaskRefRowProps) {
  const original = useTaskStore((s) => s.getResolvedTask(taskRef))
  const toggleTaskRef = useTaskStore((s) => s.toggleTaskRef)
  const removeTaskRef = useTaskStore((s) => s.removeTaskRef)
  const [hovered, setHovered] = useState(false)

  const originDateStr = taskRef.originDate.includes('__block__')
    ? taskRef.originDate.substring(0, taskRef.originDate.indexOf('__block__'))
    : taskRef.originDate
  const originLabel = `De ${format(parseISO(originDateStr), "d/MMM", { locale: pt })}`

  if (!original) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -16, transition: { duration: 0.15 } }}
        layout
        className="flex items-center gap-3 py-2.5 px-2 border-l-2 border-stone-300/60 rounded-r-md bg-stone-100/50"
      >
        <span className="flex-1 text-sm italic text-text-muted">Tarefa removida</span>
        <button
          onClick={() => removeTaskRef(dateKey, taskRef.id)}
          aria-label="Remover referência"
          className="shrink-0 p-1 rounded hover:bg-bg-tertiary transition-colors"
        >
          <X size={14} className="text-text-muted hover:text-text-secondary transition-colors" />
        </button>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16, transition: { duration: 0.15 } }}
      layout
      role="listitem"
      className="flex items-center gap-3 py-2.5 px-2 border-l-2 border-amber-400/60 rounded-r-md bg-amber-50/40"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => toggleTaskRef(dateKey, taskRef.id)}
        role="checkbox"
        aria-checked={original.completed}
        aria-label="Marcar como concluída"
        className={`shrink-0 w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center transition-all ${
          original.completed
            ? 'bg-success border-success'
            : hovered
              ? 'border-border-light opacity-100'
              : 'border-border opacity-40'
        }`}
      >
        {original.completed && (
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

      <Link2 size={12} className="shrink-0 text-text-muted/50" aria-hidden="true" />

      <span className={`flex-1 text-sm ${original.completed ? 'line-through text-text-muted' : 'text-text-primary'}`}>
        {original.text}
      </span>

      <span className="shrink-0 text-[10px] text-text-muted bg-stone-200/60 rounded px-1.5 py-0.5">
        {originLabel}
      </span>

      <div className={`flex items-center transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'}`}>
        <button
          onClick={() => removeTaskRef(dateKey, taskRef.id)}
          aria-label="Remover referência"
          className="shrink-0 p-1 rounded hover:bg-bg-tertiary transition-colors"
        >
          <X size={14} className="text-text-muted hover:text-text-secondary transition-colors" />
        </button>
      </div>
    </motion.div>
  )
}
