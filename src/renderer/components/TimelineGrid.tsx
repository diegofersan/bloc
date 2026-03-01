import { useRef, useState, useEffect } from 'react'
import type { TimeBlock } from '../stores/timeBlockStore'
import TimeBlockItem, { HOUR_HEIGHT, START_HOUR, timeToY } from './TimeBlockItem'
import TimeBlockCreator from './TimeBlockCreator'

const GUTTER_WIDTH = 56

// Visual order: 01, 02, ..., 23, 00
const HOURS_ORDER = Array.from({ length: 24 }, (_, i) => (i + START_HOUR) % 24)

function getTimezoneLabel(): string {
  const offset = -new Date().getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const absH = Math.floor(Math.abs(offset) / 60)
  const absM = Math.abs(offset) % 60
  return absM === 0
    ? `GMT${sign}${String(absH).padStart(2, '0')}`
    : `GMT${sign}${String(absH).padStart(2, '0')}:${String(absM).padStart(2, '0')}`
}

function formatHour(h: number): string {
  return String(h).padStart(2, '0')
}

interface TimelineGridProps {
  blocks: TimeBlock[]
  onUpdate: (blockId: string, updates: Partial<Pick<TimeBlock, 'startTime' | 'endTime' | 'title' | 'color'>>) => void
  onRemove: (blockId: string) => void
  onBlockClick: (block: TimeBlock) => void
  onCreateBlock: (startTime: number, endTime: number) => void
}

export default function TimelineGrid({
  blocks,
  onUpdate,
  onRemove,
  onBlockClick,
  onCreateBlock
}: TimelineGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const hasScrolled = useRef(false)

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (hasScrolled.current || !gridRef.current) return
    hasScrolled.current = true
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const scrollTo = Math.max(0, timeToY(currentMinutes) - 200)
    gridRef.current.scrollTop = scrollTo
  }, [])

  // Current time indicator
  const [currentMinutes, setCurrentMinutes] = useState(() => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  })

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date()
      setCurrentMinutes(now.getHours() * 60 + now.getMinutes())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const currentTimeTop = timeToY(currentMinutes)
  const currentHour = Math.floor(currentMinutes / 60)
  const currentMin = currentMinutes % 60
  const currentTimeLabel = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`
  const tzLabel = getTimezoneLabel()

  return (
    <div ref={gridRef} className="h-full overflow-y-auto relative">
      <div className="relative" style={{ height: 24 * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}>

        {/* Hour rows — rendered in visual order */}
        {HOURS_ORDER.map((h, visualIndex) => {
          const y = visualIndex * HOUR_HEIGHT
          return (
            <div key={h}>
              {/* Hour line */}
              <div
                className="absolute border-t border-border/30 pointer-events-none"
                style={{ top: y, left: GUTTER_WIDTH, right: 0 }}
              />
              {/* Hour label — vertically centered on the line */}
              <div
                className="absolute pointer-events-none flex items-center justify-end pr-3"
                style={{ top: y - 5, left: 0, width: GUTTER_WIDTH, height: 10 }}
              >
                <span className="text-[10px] text-text-muted/70 font-medium tabular-nums select-none leading-none">
                  {formatHour(h)}
                </span>
              </div>
              {/* Half-hour line */}
              <div
                className="absolute border-t border-dashed border-border/15 pointer-events-none"
                style={{ top: y + HOUR_HEIGHT / 2, left: GUTTER_WIDTH, right: 0 }}
              />
            </div>
          )
        })}

        {/* Closing line at the bottom (end of 00:xx row) */}
        <div
          className="absolute border-t border-border/30 pointer-events-none"
          style={{ top: 24 * HOUR_HEIGHT, left: GUTTER_WIDTH, right: 0 }}
        />

        {/* Timezone label at top-left */}
        <div
          className="absolute pointer-events-none flex items-center justify-end pr-3"
          style={{ top: -2, left: 0, width: GUTTER_WIDTH }}
        >
          <span className="text-[9px] text-text-muted/50 font-medium select-none">{tzLabel}</span>
        </div>

        {/* Current time indicator */}
        <div
          className="absolute z-20 pointer-events-none"
          style={{ top: currentTimeTop, left: 0, right: 0 }}
        >
          {/* Current time label in gutter */}
          <div
            className="absolute flex items-center justify-end pr-2"
            style={{ top: -8, left: 0, width: GUTTER_WIDTH, height: 16 }}
          >
            <span className="text-[10px] text-error font-semibold tabular-nums select-none bg-bg-primary px-0.5 rounded leading-none">
              {currentTimeLabel}
            </span>
          </div>
          {/* Red line + dot */}
          <div className="flex items-center" style={{ marginLeft: GUTTER_WIDTH - 4 }}>
            <div className="w-2 h-2 rounded-full bg-error shrink-0" />
            <div className="flex-1 h-[1.5px] bg-error/70" />
          </div>
        </div>

        {/* Time block creation overlay */}
        <TimeBlockCreator
          gridRef={gridRef}
          onCreateStart={onCreateBlock}
        />

        {/* Time blocks — positioned in events area */}
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{ left: GUTTER_WIDTH, right: 8, overflow: 'visible' }}
        >
          {blocks.map((block) => (
            <TimeBlockItem
              key={block.id}
              block={block}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onClick={onBlockClick}
              gridTop={0}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
