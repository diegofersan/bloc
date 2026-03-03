import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ConfirmDialogProps {
  visible: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  visible,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus cancel button when dialog opens
  useEffect(() => {
    if (visible) {
      setTimeout(() => cancelRef.current?.focus(), 50)
    }
  }, [visible])

  // Escape to cancel
  useEffect(() => {
    if (!visible) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [visible, onCancel])

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
          aria-label={title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-bg-secondary rounded-xl shadow-xl border border-border w-full max-w-sm mx-4 p-5"
          >
            <h3 className="text-sm font-semibold text-text-primary mb-1">{title}</h3>
            {description && (
              <p className="text-xs text-text-secondary leading-relaxed mb-4">{description}</p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                ref={cancelRef}
                onClick={onCancel}
                className="px-3 py-1.5 text-xs font-medium text-text-secondary rounded-lg hover:bg-bg-hover transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  destructive
                    ? 'bg-error text-white hover:bg-error/90'
                    : 'bg-accent text-white hover:bg-accent-hover'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
