import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2, RotateCcw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, parseISO } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useTimeBlockStore, type DeletedTimeBlock } from '../stores/timeBlockStore'
import ConfirmDialog from '../components/ConfirmDialog'

const COLOR_DOT: Record<string, string> = {
  indigo: 'bg-indigo-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  sky: 'bg-sky-500',
  violet: 'bg-violet-500',
  slate: 'bg-slate-400'
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatDeletedDate(timestamp: number): string {
  return format(new Date(timestamp), "d MMM yyyy, HH:mm", { locale: pt })
}

function formatBlockDate(dateStr: string): string {
  try {
    const raw = format(parseISO(dateStr), "EEEE, d 'de' MMMM", { locale: pt })
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  } catch {
    return dateStr
  }
}

export default function TrashView() {
  const navigate = useNavigate()
  const deletedBlocks = useTimeBlockStore((s) => s.deletedBlocks)
  const restoreBlock = useTimeBlockStore((s) => s.restoreBlock)
  const permanentlyDeleteBlock = useTimeBlockStore((s) => s.permanentlyDeleteBlock)
  const clearAllDeletedBlocks = useTimeBlockStore((s) => s.clearAllDeletedBlocks)
  const cleanOldDeletedBlocks = useTimeBlockStore((s) => s.cleanOldDeletedBlocks)

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)

  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Auto-clean old blocks on mount
  useEffect(() => {
    cleanOldDeletedBlocks()
  }, [cleanOldDeletedBlocks])

  const handleRestore = useCallback((blockId: string) => {
    restoreBlock(blockId)
  }, [restoreBlock])

  const handlePermanentDelete = useCallback((blockId: string) => {
    setConfirmDelete(blockId)
  }, [])

  const handleClearAll = useCallback(() => {
    setConfirmClearAll(true)
  }, [])

  // Sort by deletedAt descending (most recently deleted first)
  const sorted = [...deletedBlocks].sort((a, b) => b.deletedAt - a.deletedAt)

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Titlebar */}
      <div className={`titlebar-drag shrink-0 flex items-end justify-between ${isNarrow ? 'px-3 pt-[38px]' : 'pl-5 pr-6 pt-[50px]'} pb-2`}>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate(-1)}
            aria-label="Voltar"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors"
          >
            <ArrowLeft size={18} />
          </motion.button>
          <h1 className="text-sm font-semibold text-text-primary">Lixeira</h1>
        </div>
        {sorted.length > 0 && (
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={handleClearAll}
              className="text-xs font-medium text-error hover:text-error/80 transition-colors px-2 py-1 rounded-lg hover:bg-error/10"
            >
              Limpar tudo
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Trash2 size={32} className="text-text-muted/30" />
            <p className="text-sm text-text-muted/60">A lixeira esta vazia</p>
            <p className="text-xs text-text-muted/40">Blocos eliminados aparecem aqui durante 30 dias</p>
          </div>
        ) : (
          <div className="max-w-lg mx-auto mt-4 space-y-2">
            <p className="text-xs text-text-muted mb-3">
              {sorted.length} {sorted.length === 1 ? 'bloco eliminado' : 'blocos eliminados'} — auto-limpeza apos 30 dias
            </p>
            <AnimatePresence>
              {sorted.map((block) => (
                <TrashItem
                  key={block.id}
                  block={block}
                  onRestore={handleRestore}
                  onDelete={handlePermanentDelete}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Confirm permanent delete single block */}
      <ConfirmDialog
        visible={confirmDelete !== null}
        title="Eliminar permanentemente?"
        description="Esta acao nao pode ser desfeita."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        destructive
        onConfirm={() => {
          if (confirmDelete) permanentlyDeleteBlock(confirmDelete)
          setConfirmDelete(null)
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Confirm clear all */}
      <ConfirmDialog
        visible={confirmClearAll}
        title="Limpar toda a lixeira?"
        description={`${sorted.length} ${sorted.length === 1 ? 'bloco sera eliminado' : 'blocos serao eliminados'} permanentemente. Esta acao nao pode ser desfeita.`}
        confirmLabel="Limpar tudo"
        cancelLabel="Cancelar"
        destructive
        onConfirm={() => {
          clearAllDeletedBlocks()
          setConfirmClearAll(false)
        }}
        onCancel={() => setConfirmClearAll(false)}
      />
    </div>
  )
}

function TrashItem({
  block,
  onRestore,
  onDelete
}: {
  block: DeletedTimeBlock
  onRestore: (id: string) => void
  onDelete: (id: string) => void
}) {
  const dotColor = COLOR_DOT[block.color] || 'bg-slate-400'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.15 }}
      className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-bg-hover transition-colors"
    >
      {/* Color dot */}
      <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />

      {/* Block info */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-text-primary truncate">
          {block.title || 'Sem titulo'}
        </div>
        <div className="text-[10px] text-text-muted mt-0.5">
          {formatBlockDate(block.date)} — {formatTime(block.startTime)} – {formatTime(block.endTime)}
        </div>
        <div className="text-[10px] text-text-muted/60 mt-0.5">
          Eliminado em {formatDeletedDate(block.deletedAt)}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => onRestore(block.id)}
          className="p-1.5 rounded-lg hover:bg-bg-secondary transition-colors"
          aria-label="Restaurar"
          title="Restaurar"
        >
          <RotateCcw size={13} className="text-text-secondary" />
        </button>
        <button
          onClick={() => onDelete(block.id)}
          className="p-1.5 rounded-lg hover:bg-error/10 transition-colors"
          aria-label="Eliminar permanentemente"
          title="Eliminar permanentemente"
        >
          <Trash2 size={13} className="text-error/70" />
        </button>
      </div>
    </motion.div>
  )
}
