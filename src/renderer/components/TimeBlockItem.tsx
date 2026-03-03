import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Palette, Trash2, GripVertical } from 'lucide-react'
import type { TimeBlock, TimeBlockColor } from '../stores/timeBlockStore'
import ColorPicker from './ColorPicker'
import ConfirmDialog from './ConfirmDialog'

const HOUR_HEIGHT = 60
const SNAP_MINUTES = 15
const START_HOUR = 1 // grid starts at 01:00, ends at 00:00

/** Convert real minutes (since midnight) to visual Y position */
function timeToY(minutes: number): number {
  const shifted = ((minutes - START_HOUR * 60) + 1440) % 1440
  return (shifted / 60) * HOUR_HEIGHT
}

const COLOR_MAP: Record<TimeBlockColor, { bg: string; border: string; text: string }> = {
  indigo: { bg: 'bg-indigo-500/15', border: 'border-indigo-500/30', text: 'text-indigo-700' },
  emerald: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-700' },
  amber: { bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-700' },
  rose: { bg: 'bg-rose-500/15', border: 'border-rose-500/30', text: 'text-rose-700' },
  sky: { bg: 'bg-sky-500/15', border: 'border-sky-500/30', text: 'text-sky-700' },
  violet: { bg: 'bg-violet-500/15', border: 'border-violet-500/30', text: 'text-violet-700' },
  slate: { bg: 'bg-slate-500/15', border: 'border-slate-500/30', text: 'text-slate-600' }
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function snapToGrid(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
}

interface TimeBlockItemProps {
  block: TimeBlock
  onUpdate: (blockId: string, updates: Partial<Pick<TimeBlock, 'startTime' | 'endTime' | 'title' | 'color'>>) => void
  onRemove: (blockId: string) => void
  onClick: (block: TimeBlock) => void
  gridTop: number
}

export default function TimeBlockItem({ block, onUpdate, onRemove, onClick, gridTop }: TimeBlockItemProps) {
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; left: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const dragRef = useRef<{ startY: number; startTime: number }>({ startY: 0, startTime: 0 })
  const resizeRef = useRef<{ startY: number; startEnd: number }>({ startY: 0, startEnd: 0 })
  const didDrag = useRef(false)

  const colors = COLOR_MAP[block.color]
  const top = timeToY(block.startTime)
  const MIN_VISIBLE_HEIGHT = 24 // enough for title text
  const height = Math.max(((block.endTime - block.startTime) / 60) * HOUR_HEIGHT, MIN_VISIBLE_HEIGHT)
  const duration = block.endTime - block.startTime

  // Drag to move — initiated from anywhere on the block (except buttons and resize handle)
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.stopPropagation()
    e.preventDefault()
    didDrag.current = false
    setIsDragging(true)
    dragRef.current = { startY: e.clientY, startTime: block.startTime }
  }, [block.startTime])

  useEffect(() => {
    if (!isDragging) return

    function onMouseMove(e: MouseEvent) {
      const dy = e.clientY - dragRef.current.startY
      if (Math.abs(dy) > 3) didDrag.current = true
      const dMinutes = (dy / HOUR_HEIGHT) * 60
      const newStart = snapToGrid(Math.max(0, Math.min(1440 - duration, dragRef.current.startTime + dMinutes)))
      onUpdate(block.id, { startTime: newStart, endTime: newStart + duration })
    }

    function onMouseUp() {
      setIsDragging(false)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isDragging, block.id, duration, onUpdate])

  // Resize from bottom
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setIsResizing(true)
    resizeRef.current = { startY: e.clientY, startEnd: block.endTime }
  }, [block.endTime])

  useEffect(() => {
    if (!isResizing) return

    function onMouseMove(e: MouseEvent) {
      const dy = e.clientY - resizeRef.current.startY
      const dMinutes = (dy / HOUR_HEIGHT) * 60
      const newEnd = snapToGrid(Math.max(block.startTime + SNAP_MINUTES, Math.min(1440, resizeRef.current.startEnd + dMinutes)))
      onUpdate(block.id, { endTime: newEnd })
    }

    function onMouseUp() {
      setIsResizing(false)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isResizing, block.id, block.startTime, onUpdate])

  // Click on title to enter detail — only if mouse didn't move (not a drag)
  const handleTitleClick = useCallback((e: React.MouseEvent) => {
    if (didDrag.current) return
    e.stopPropagation()
    onClick(block)
  }, [block, onClick])

  return (
    <motion.div
      layout={!isDragging && !isResizing}
      data-timeblock
      onMouseDown={handleDragStart}
      style={{ top, height, minHeight: 22, left: 4, right: 4, position: 'absolute', overflow: 'visible' }}
      className={`group rounded-lg border pointer-events-auto ${colors.bg} ${colors.border} ${
        isDragging || isResizing ? 'z-30 shadow-lg' : 'z-10'
      } ${showColorPicker ? 'z-40' : ''} cursor-grab active:cursor-grabbing`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Grip icon — visual only */}
      <div className="absolute top-0 left-0 right-0 h-5 flex items-center justify-center pointer-events-none">
        <GripVertical size={10} className="text-text-muted/40 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <div className="px-2 pt-1 pb-1 h-full flex flex-col overflow-hidden">
        <div
          className={`text-xs font-medium leading-tight ${colors.text} truncate cursor-pointer hover:underline shrink-0`}
          onClick={handleTitleClick}
        >
          {block.title || 'Sem título'}
        </div>
        {duration >= 30 && (
          <div className="text-[10px] text-text-muted mt-0.5">
            {formatTime(block.startTime)} – {formatTime(block.endTime)}
          </div>
        )}

        {/* Actions (show on hover) */}
        <div className="mt-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity pb-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation()
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setPickerAnchor({ top: rect.bottom + 4, left: rect.left })
              setShowColorPicker(true)
            }}
            className="p-0.5 rounded hover:bg-black/5 transition-colors"
            aria-label="Cor"
          >
            <Palette size={11} className="text-text-muted" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowDeleteConfirm(true)
            }}
            className="p-0.5 rounded hover:bg-black/5 transition-colors"
            aria-label="Eliminar"
          >
            <Trash2 size={11} className="text-text-muted" />
          </button>
        </div>

      </div>

      {/* Color picker — portal to body, positioned via anchorRect */}
      <ColorPicker
        value={block.color}
        onChange={(color) => onUpdate(block.id, { color })}
        visible={showColorPicker}
        onClose={() => setShowColorPicker(false)}
        anchorRect={pickerAnchor}
      />

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize"
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        visible={showDeleteConfirm}
        title="Tens a certeza que queres eliminar este bloco?"
        description={`"${block.title || 'Sem título'}" sera movido para a lixeira.`}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        destructive
        onConfirm={() => {
          setShowDeleteConfirm(false)
          onRemove(block.id)
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </motion.div>
  )
}

export { HOUR_HEIGHT, SNAP_MINUTES, START_HOUR, COLOR_MAP, formatTime, timeToY }
