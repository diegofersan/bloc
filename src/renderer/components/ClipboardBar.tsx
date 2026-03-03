import { motion, AnimatePresence } from 'framer-motion'
import { X, Move, Copy } from 'lucide-react'
import { useClipboardStore } from '../stores/clipboardStore'

export default function ClipboardBar() {
  const task = useClipboardStore((s) => s.task)
  const mode = useClipboardStore((s) => s.mode)
  const clearClipboard = useClipboardStore((s) => s.clearClipboard)

  return (
    <AnimatePresence>
      {task && mode && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-full bg-bg-secondary border border-border shadow-lg"
        >
          {mode === 'move' ? (
            <Move size={14} className="shrink-0 text-accent" />
          ) : (
            <Copy size={14} className="shrink-0 text-ai" />
          )}
          <span className="text-xs font-medium text-text-secondary max-w-[200px] truncate">
            {mode === 'move' ? 'Mover' : 'Copiar'}: {task.text}
          </span>
          <button
            onClick={clearClipboard}
            className="shrink-0 p-1 rounded hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary"
            aria-label="Cancelar"
          >
            <X size={14} />
          </button>
          <span className="text-[10px] text-text-muted">Esc para cancelar</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
