import { useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Play, Pause } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePomodoroStore } from '../stores/pomodoroStore'
import { playWorkDoneSound, playBreakDoneSound, playCountdownTick } from '../services/notificationSound'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function PomodoroTimer() {
  const { status, isPaused, secondsRemaining } = usePomodoroStore()
  const startWork = usePomodoroStore((s) => s.startWork)
  const pause = usePomodoroStore((s) => s.pause)
  const resume = usePomodoroStore((s) => s.resume)
  const tick = usePomodoroStore((s) => s.tick)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { date } = useParams<{ date: string }>()

  useEffect(() => {
    if ((status === 'working' || status === 'break') && !isPaused) {
      intervalRef.current = setInterval(tick, 1000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [status, isPaused, tick])

  const prevStatusRef = useRef(status)

  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = status

    if (prev === 'working' && status === 'break') {
      playWorkDoneSound()
    } else if (prev === 'break' && status === 'idle') {
      playBreakDoneSound()
    }
  }, [status])

  // Tray update
  useEffect(() => {
    if (status === 'idle') {
      window.bloc?.updatePomodoroTray(null, null)
      return
    }
    const time = formatTime(secondsRemaining)
    const pauseIndicator = isPaused ? ' ⏸' : ''
    window.bloc?.updatePomodoroTray(`${time}${pauseIndicator}`, status)
  }, [status, secondsRemaining, isPaused])

  // Cleanup tray on unmount
  useEffect(() => {
    return () => window.bloc?.updatePomodoroTray(null, null)
  }, [])

  // Countdown tick in last 10 seconds
  useEffect(() => {
    if (secondsRemaining <= 10 && secondsRemaining > 0 && !isPaused && status !== 'idle') {
      playCountdownTick()
    }
  }, [secondsRemaining, isPaused, status])

  const isActive = status !== 'idle'
  const statusColor = status === 'working' ? 'text-accent' : status === 'break' ? 'text-success' : 'text-text-muted'

  return (
    <div className="flex items-center">
      <AnimatePresence mode="wait">
        {isActive ? (
          <motion.button
            key="active"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            onClick={isPaused ? resume : pause}
            aria-label={isPaused ? 'Retomar timer' : 'Pausar timer'}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-bg-hover transition-colors"
          >
            {isPaused ? (
              <Play size={14} className={statusColor} />
            ) : (
              <Pause size={14} className={statusColor} />
            )}
            <span role="timer" aria-live="off" className={`text-xs font-medium tabular-nums ${statusColor}`}>
              {formatTime(secondsRemaining)}
            </span>
          </motion.button>
        ) : (
          <motion.button
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => date && startWork(date)}
            aria-label="Iniciar Pomodoro"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors"
          >
            <Play size={14} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
