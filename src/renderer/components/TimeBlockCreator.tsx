import { useState, useRef, useCallback, useEffect } from 'react'
import { HOUR_HEIGHT, SNAP_MINUTES, START_HOUR, timeToY } from './TimeBlockItem'

function snapToGrid(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Convert visual Y position back to real minutes (since midnight) */
function yToTime(y: number): number {
  const shiftedMinutes = (y / HOUR_HEIGHT) * 60
  return (shiftedMinutes + START_HOUR * 60) % 1440
}

const DEFAULT_GUTTER_WIDTH = 56

interface TimeBlockCreatorProps {
  gridRef: React.RefObject<HTMLDivElement | null>
  onCreateStart: (startTime: number, endTime: number) => void
  gutterWidth?: number
}

export default function TimeBlockCreator({ gridRef, onCreateStart, gutterWidth }: TimeBlockCreatorProps) {
  const gutter = gutterWidth ?? DEFAULT_GUTTER_WIDTH
  const [isCreating, setIsCreating] = useState(false)
  const [previewStart, setPreviewStart] = useState(0)
  const [previewEnd, setPreviewEnd] = useState(0)
  const createRef = useRef<{ startY: number; startMinutes: number }>({ startY: 0, startMinutes: 0 })

  const getMinutesFromY = useCallback(
    (clientY: number): number => {
      if (!gridRef.current) return 0
      const rect = gridRef.current.getBoundingClientRect()
      const scrollTop = gridRef.current.scrollTop
      const y = clientY - rect.top + scrollTop
      const realMinutes = yToTime(y)
      return snapToGrid(Math.max(0, Math.min(1440, realMinutes)))
    },
    [gridRef]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (target.closest('[data-timeblock]')) return

      // Ignore clicks in the hour gutter
      if (gridRef.current) {
        const rect = gridRef.current.getBoundingClientRect()
        if (e.clientX - rect.left < gutter) return
      }

      const minutes = getMinutesFromY(e.clientY)
      setIsCreating(true)
      setPreviewStart(minutes)
      setPreviewEnd(minutes + SNAP_MINUTES)
      createRef.current = { startY: e.clientY, startMinutes: minutes }
    },
    [getMinutesFromY, gridRef, gutter]
  )

  useEffect(() => {
    if (!isCreating) return

    function onMouseMove(e: MouseEvent) {
      const current = getMinutesFromY(e.clientY)
      const start = createRef.current.startMinutes
      if (current >= start) {
        setPreviewStart(start)
        setPreviewEnd(Math.max(current, start + SNAP_MINUTES))
      } else {
        setPreviewStart(current)
        setPreviewEnd(start + SNAP_MINUTES)
      }
    }

    function onMouseUp() {
      setIsCreating(false)
      const start = Math.min(previewStart, previewEnd)
      const end = Math.max(previewStart, previewEnd)
      if (end - start >= SNAP_MINUTES) {
        onCreateStart(start, end)
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isCreating, previewStart, previewEnd, getMinutesFromY, onCreateStart])

  const top = timeToY(Math.min(previewStart, previewEnd))
  const height = (Math.abs(previewEnd - previewStart) / 60) * HOUR_HEIGHT

  return (
    <>
      {/* Invisible overlay for mouse events */}
      <div
        className="absolute inset-0 z-5"
        onMouseDown={handleMouseDown}
      />

      {/* Preview block while creating */}
      {isCreating && height > 0 && (
        <div
          className="absolute right-2 z-20 rounded-lg bg-accent/15 border border-accent/30 pointer-events-none"
          style={{ top, height, left: gutter }}
        >
          <div className="px-2 pt-1 text-[10px] text-accent font-medium">
            {formatTime(Math.min(previewStart, previewEnd))} – {formatTime(Math.max(previewStart, previewEnd))}
          </div>
        </div>
      )}
    </>
  )
}
