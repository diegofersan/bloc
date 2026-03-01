import { useEffect } from 'react'
import { CheckCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ReactNode } from 'react'

export default function Toast({
  message,
  icon,
  duration = 2500,
  visible,
  onClose,
  action
}: {
  message: string
  icon?: ReactNode
  duration?: number
  visible: boolean
  onClose: () => void
  action?: { label: string; onClick: () => void }
}) {
  useEffect(() => {
    if (!visible || !duration) return
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [visible, duration, onClose])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15 }}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-bg-secondary border border-border shadow-sm rounded-lg px-4 py-2"
        >
          <span aria-hidden="true">{icon ?? <CheckCircle size={14} className="text-success shrink-0" />}</span>
          <span className="text-sm text-text-primary">{message}</span>
          {action && (
            <button
              onClick={action.onClick}
              className="ml-2 text-xs font-medium text-accent hover:text-accent-hover transition-colors"
            >
              {action.label}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
