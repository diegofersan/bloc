import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { useTaskStore } from '../stores/taskStore'

export default function QuickCaptureOverlay({
  visible,
  onClose,
  onCaptured
}: {
  visible: boolean
  onClose: () => void
  onCaptured: () => void
}) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocusRef = useRef<Element | null>(null)
  const addDistraction = useTaskStore((s) => s.addDistraction)

  useEffect(() => {
    if (visible) {
      previousFocusRef.current = document.activeElement
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus()
      }
    }
  }, [visible])

  // Focus trap: keep focus inside the overlay
  useEffect(() => {
    if (!visible) return
    function handleFocusTrap(e: KeyboardEvent) {
      if (e.key === 'Tab') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleFocusTrap)
    return () => window.removeEventListener('keydown', handleFocusTrap)
  }, [visible])

  function handleSubmit() {
    const trimmed = text.trim()
    if (!trimmed) return
    const today = format(new Date(), 'yyyy-MM-dd')
    addDistraction(today, trimmed)
    setText('')
    onClose()
    onCaptured()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSubmit()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          role="dialog"
          aria-modal="true"
          aria-label="Captura rápida de distracção"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
            className="mt-[20vh] sm:mt-[30vh] w-[480px] max-w-[calc(100vw-32px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 bg-bg-secondary border border-border rounded-xl px-4 py-3 shadow-lg">
              <div className="shrink-0 w-2 h-2 rounded-full border border-distraction" />
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Anotar distração..."
                aria-label="Texto da distracção"
                className="flex-1 text-sm text-text-primary bg-transparent outline-none placeholder:text-text-muted"
              />
            </div>
            <p className="text-center text-xs text-text-muted mt-2">
              ↵ guardar · Esc fechar
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
