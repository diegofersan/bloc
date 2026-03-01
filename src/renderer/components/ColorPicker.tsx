import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import type { TimeBlockColor } from '../stores/timeBlockStore'

const COLORS: { id: TimeBlockColor; bg: string; label: string }[] = [
  { id: 'indigo', bg: 'bg-indigo-500', label: 'Índigo' },
  { id: 'emerald', bg: 'bg-emerald-500', label: 'Esmeralda' },
  { id: 'amber', bg: 'bg-amber-500', label: 'Âmbar' },
  { id: 'rose', bg: 'bg-rose-500', label: 'Rosa' },
  { id: 'sky', bg: 'bg-sky-500', label: 'Céu' },
  { id: 'violet', bg: 'bg-violet-500', label: 'Violeta' },
  { id: 'slate', bg: 'bg-slate-500', label: 'Ardósia' }
]

interface ColorPickerProps {
  value: TimeBlockColor
  onChange: (color: TimeBlockColor) => void
  visible: boolean
  onClose: () => void
  anchorRect?: { top: number; left: number } | null
}

export default function ColorPicker({ value, onChange, visible, onClose, anchorRect }: ColorPickerProps) {
  const content = (
    <AnimatePresence>
      {visible && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.12 }}
            className="fixed z-[9999] flex gap-1.5 rounded-lg bg-bg-secondary border border-border shadow-lg p-2"
            style={anchorRect ? { top: anchorRect.top, left: anchorRect.left } : undefined}
          >
            {COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onChange(c.id)
                  onClose()
                }}
                aria-label={c.label}
                className={`w-5 h-5 rounded-full ${c.bg} transition-transform ${
                  value === c.id ? 'ring-2 ring-offset-1 ring-text-primary scale-110' : 'hover:scale-110'
                }`}
              />
            ))}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}

export { COLORS }
