import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface HourglassIndicatorProps {
  startTime: number
  endTime: number
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

export default function HourglassIndicator({ startTime, endTime }: HourglassIndicatorProps) {
  const [nowMinutes, setNowMinutes] = useState(getNowMinutes)
  const [showRemaining, setShowRemaining] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const id = setInterval(() => setNowMinutes(getNowMinutes()), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  const progress = useMemo(() => {
    const total = endTime - startTime
    if (total <= 0) return 0
    const elapsed = nowMinutes - startTime
    return Math.max(0, Math.min(1, elapsed / total))
  }, [startTime, endTime, nowMinutes])

  const remaining = useMemo(
    () => Math.max(0, endTime - nowMinutes),
    [endTime, nowMinutes]
  )

  const handleClick = useCallback(() => {
    setShowRemaining(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setShowRemaining(false), 5000)
  }, [])

  return (
    <div className="relative flex items-center gap-1.5">
      <div
        className="relative w-4 h-4 rounded-sm border border-current opacity-30 overflow-hidden cursor-pointer"
        onClick={handleClick}
      >
        <motion.div
          className="absolute bottom-0 left-0 right-0 bg-current"
          initial={false}
          animate={{ height: `${progress * 100}%` }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
        />
      </div>

      <AnimatePresence>
        {showRemaining && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.15 }}
            className="text-[10px] text-text-muted whitespace-nowrap"
          >
            {formatDuration(remaining)} restante
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}
