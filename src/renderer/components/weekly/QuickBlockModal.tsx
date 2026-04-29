import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { TimeBlockColor } from '../../stores/timeBlockStore'

const COLORS: TimeBlockColor[] = ['indigo', 'emerald', 'amber', 'rose', 'sky', 'violet', 'slate']
const COLOR_CLASS: Record<TimeBlockColor, string> = {
  indigo: 'bg-indigo-400',
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  rose: 'bg-rose-400',
  sky: 'bg-sky-400',
  violet: 'bg-violet-400',
  slate: 'bg-slate-400'
}

interface Props {
  open: boolean
  onClose: () => void
  onCreate: (b: { title: string; startTime: number; endTime: number; color: TimeBlockColor }) => void
}

function parseHHMM(s: string): number | null {
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

export default function QuickBlockModal({ open, onClose, onCreate }: Props) {
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('09:00')
  const [duration, setDuration] = useState(60)
  const [color, setColor] = useState<TimeBlockColor>('indigo')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTitle('')
      setStart('09:00')
      setDuration(60)
      setColor('indigo')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const startTime = parseHHMM(start)
    if (startTime === null) return
    const endTime = Math.min(1439, startTime + Math.max(15, duration))
    if (endTime <= startTime) return
    onCreate({
      title: title.trim() || 'Sem título',
      startTime,
      endTime,
      color
    })
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={onClose}
        >
          <motion.form
            onSubmit={handleSubmit}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="bg-bg-primary border border-border rounded-xl p-5 w-[340px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-text-primary mb-3">Novo bloco</h3>
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título"
              className="w-full mb-3 px-3 py-2 rounded-lg border border-border bg-bg-secondary text-sm text-text-primary outline-none focus:border-accent"
            />
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <label className="block text-xs text-text-muted mb-1">Início</label>
                <input
                  type="text"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  placeholder="HH:MM"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-sm text-text-primary outline-none focus:border-accent"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-text-muted mb-1">Duração (min)</label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value, 10) || 0)}
                  min={15}
                  step={15}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-sm text-text-primary outline-none focus:border-accent"
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs text-text-muted mb-1.5">Cor</label>
              <div className="flex gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={c}
                    className={`w-6 h-6 rounded-full ${COLOR_CLASS[c]} ${
                      color === c ? 'ring-2 ring-offset-2 ring-offset-bg-primary ring-text-primary' : ''
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-bg-hover"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90"
              >
                Criar
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
