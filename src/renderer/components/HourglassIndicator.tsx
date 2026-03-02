import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { TimeBlockColor } from '../stores/timeBlockStore'
import { formatTime } from './TimeBlockItem'

const FILL_COLORS: Record<TimeBlockColor, string> = {
  indigo: '#6366f1',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  sky: '#0ea5e9',
  violet: '#8b5cf6',
  slate: '#64748b'
}

interface HourglassIndicatorProps {
  startTime: number
  endTime: number
  color: TimeBlockColor
  showTimes?: boolean
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function getNowMinutes(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

export default function HourglassIndicator({ startTime, endTime, color, showTimes = false }: HourglassIndicatorProps) {
  const [nowMinutes, setNowMinutes] = useState(getNowMinutes)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setNowMinutes(getNowMinutes()), 60_000)
    return () => clearInterval(id)
  }, [])

  const progress = useMemo(() => {
    const total = endTime - startTime
    if (total <= 0) return 0
    const elapsed = nowMinutes - startTime
    return Math.max(0, Math.min(1, elapsed / total))
  }, [startTime, endTime, nowMinutes])

  const elapsed = useMemo(
    () => Math.max(0, Math.min(endTime - startTime, nowMinutes - startTime)),
    [startTime, endTime, nowMinutes]
  )

  const remaining = useMemo(
    () => Math.max(0, endTime - nowMinutes),
    [endTime, nowMinutes]
  )

  const fillColor = FILL_COLORS[color]

  const handleMouseEnter = useCallback(() => setHovered(true), [])
  const handleMouseLeave = useCallback(() => setHovered(false), [])

  return (
    <div className="relative flex items-center gap-1.5">
      {/* Square indicator */}
      <div
        className="relative w-8 h-8 rounded border border-slate-300 overflow-hidden"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Fill from bottom */}
        <motion.div
          className="absolute bottom-0 left-0 right-0"
          style={{ backgroundColor: fillColor, opacity: 0.35 }}
          initial={false}
          animate={{ height: `${progress * 100}%` }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
        />

        {/* Tooltip */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-slate-800 text-white text-[10px] leading-tight whitespace-nowrap pointer-events-none"
            >
              <div>{formatDuration(elapsed)} decorrido</div>
              <div>{formatDuration(remaining)} restante</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Start / end times (optional) */}
      {showTimes && (
        <div className="flex flex-col text-[10px] text-slate-400 leading-tight">
          <span>{formatTime(startTime)}</span>
          <span>{formatTime(endTime)}</span>
        </div>
      )}
    </div>
  )
}

export { FILL_COLORS }
