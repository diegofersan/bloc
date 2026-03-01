import { useState, useRef, useEffect } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { useTaskStore, type Distraction } from '../stores/taskStore'

export default function DistractionItem({
  distraction,
  date,
  onConvert
}: {
  distraction: Distraction
  date: string
  onConvert: (id: string) => void
}) {
  const { updateDistractionText, dismissDistraction } = useTaskStore()
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(distraction.text)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function handleBlur() {
    setEditing(false)
    const trimmed = editText.trim()
    if (trimmed && trimmed !== distraction.text) {
      updateDistractionText(date, distraction.id, trimmed)
    } else {
      setEditText(distraction.text)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      ;(e.target as HTMLInputElement).blur()
    } else if (e.key === 'Escape') {
      setEditText(distraction.text)
      setEditing(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2 }}
      className="group flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-bg-hover transition-colors"
    >
      {/* Distraction bullet */}
      <div className="shrink-0 w-2 h-2 rounded-full border border-distraction" />

      {/* Timestamp */}
      <span className="shrink-0 text-xs text-text-muted tabular-nums">
        {format(distraction.createdAt, 'HH:mm')}
      </span>

      {/* Text — editable inline */}
      {editing ? (
        <input
          ref={inputRef}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="flex-1 text-sm text-text-primary bg-transparent outline-none border-b border-accent"
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          className="flex-1 text-sm text-text-primary cursor-text"
        >
          {distraction.text}
        </span>
      )}

      {/* Convert to task */}
      <button
        onClick={() => onConvert(distraction.id)}
        aria-label="Converter em tarefa"
        className="shrink-0 p-1 rounded hover:bg-bg-tertiary transition-all opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <ArrowRight size={14} className="text-accent" />
      </button>

      {/* Dismiss */}
      <button
        onClick={() => dismissDistraction(date, distraction.id)}
        aria-label="Descartar distração"
        className="shrink-0 p-1 rounded hover:bg-bg-tertiary transition-all opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <X size={14} className="text-text-muted hover:text-text-secondary transition-colors" />
      </button>
    </motion.div>
  )
}
