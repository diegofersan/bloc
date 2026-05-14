import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { APP_OVERLAY_Z, portalToBody } from '../utils/bodyPortal'

interface DeleteBlockConfirmModalProps {
  visible: boolean
  blockTitle: string
  taskCount: number
  onConfirm: () => void
  onCancel: () => void
}

function buildMessage(title: string, count: number): string {
  if (count === 0) return `Eliminar o bloco "${title}"?`
  if (count === 1) return `Eliminar o bloco "${title}" e a 1 tarefa?`
  return `Eliminar o bloco "${title}" e as ${count} tarefas?`
}

export default function DeleteBlockConfirmModal({
  visible,
  blockTitle,
  taskCount,
  onConfirm,
  onCancel
}: DeleteBlockConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => cancelRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [visible])

  useEffect(() => {
    if (!visible) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [visible, onCancel])

  return portalToBody(
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar eliminação"
          className={`fixed inset-0 ${APP_OVERLAY_Z} flex items-start justify-center bg-black/40 backdrop-blur-sm`}
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
            className="mt-[20vh] w-[420px] max-w-[calc(100vw-32px)] bg-bg-secondary border border-border rounded-xl shadow-lg p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="shrink-0 mt-0.5 p-2 rounded-lg bg-rose-500/10 text-rose-500">
                <AlertTriangle size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-text-primary mb-1">
                  Eliminar bloco
                </h2>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {buildMessage(blockTitle, taskCount)}
                </p>
                {taskCount > 0 && (
                  <p className="text-xs text-text-muted mt-2">
                    As tarefas associadas em qualquer data serão removidas. Esta acção não pode ser desfeita.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                ref={cancelRef}
                onClick={onCancel}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:bg-bg-hover transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirm}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-rose-500 hover:bg-rose-600 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
