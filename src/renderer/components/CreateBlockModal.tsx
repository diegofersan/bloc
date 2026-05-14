import { useEffect, useRef, useState, useId, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTimeBlockStore, type TimeBlockColor } from '../stores/timeBlockStore'
import { COLORS } from './ColorPicker'
import { APP_OVERLAY_Z, portalToBody } from '../utils/bodyPortal'

interface CreateBlockModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: (id: string) => void
}

export default function CreateBlockModal({ isOpen, onClose, onCreated }: CreateBlockModalProps) {
  const addUntimedBlock = useTimeBlockStore((s) => s.addUntimedBlock)
  const getBlocksByTitle = useTimeBlockStore((s) => s.getBlocksByTitle)
  const allBlocks = useTimeBlockStore((s) => s.blocks)
  const untimedBlocks = useTimeBlockStore((s) => s.untimedBlocks)
  const getDistinctBlockTitles = useTimeBlockStore((s) => s.getDistinctBlockTitles)
  const titleListId = useId()
  const titleSuggestions = useMemo(
    () => getDistinctBlockTitles(),
    [allBlocks, untimedBlocks, getDistinctBlockTitles]
  )
  const [title, setTitle] = useState('')
  const [color, setColor] = useState<TimeBlockColor>('indigo')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setTitle('')
      setColor('indigo')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, onClose])

  const trimmed = title.trim()
  const matches = trimmed ? getBlocksByTitle(trimmed) : []
  const willMerge = matches.length > 0
  const canSubmit = trimmed.length > 0

  function handleSubmit() {
    if (!canSubmit) return
    const id = addUntimedBlock({ title: trimmed, color })
    onCreated?.(id)
    onClose()
  }

  return portalToBody(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          role="dialog"
          aria-modal="true"
          aria-label="Criar bloco"
          className={`fixed inset-0 ${APP_OVERLAY_Z} flex items-center justify-center bg-black/40 backdrop-blur-sm`}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-bg-secondary rounded-xl shadow-xl border border-border w-full max-w-sm mx-4 p-5"
          >
            <h3 className="text-sm font-semibold text-text-primary mb-4">Criar bloco</h3>

            <datalist id={titleListId}>
              {titleSuggestions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <input
              ref={inputRef}
              type="text"
              value={title}
              list={titleListId}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              placeholder="Nome do bloco"
              className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
            />

            {willMerge && (
              <p className="mt-2 text-xs text-text-muted">
                Já existe um bloco com este nome. As tarefas vão aparecer juntas.
              </p>
            )}

            <div className="mt-4">
              <p className="text-xs font-medium text-text-secondary mb-2">Cor</p>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setColor(c.id)}
                    aria-label={c.label}
                    className={`w-6 h-6 rounded-full ${c.bg} transition-transform ${
                      color === c.id ? 'ring-2 ring-offset-2 ring-offset-bg-secondary ring-text-primary scale-110' : 'hover:scale-110'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-text-secondary rounded-lg hover:bg-bg-hover transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Criar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
