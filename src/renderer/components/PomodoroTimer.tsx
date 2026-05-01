import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Play, Pause, Square, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePomodoroStore } from '../stores/pomodoroStore'
import { playWorkDoneSound, playBreakDoneSound, playCountdownTick } from '../services/notificationSound'
import { alertWorkDone, alertBreakDone } from '../services/transitionAlert'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Core timer UI — works with any date source */
export function PomodoroTimerCore({ date }: { date?: string }) {
  const { status, isPaused, secondsRemaining } = usePomodoroStore()
  const breakDuration = usePomodoroStore((s) => s.breakDuration)
  const startWork = usePomodoroStore((s) => s.startWork)
  const pause = usePomodoroStore((s) => s.pause)
  const resume = usePomodoroStore((s) => s.resume)
  const stop = usePomodoroStore((s) => s.stop)
  const tick = usePomodoroStore((s) => s.tick)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [confirmingStop, setConfirmingStop] = useState(false)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      alertWorkDone(breakDuration)
    } else if (prev === 'break' && status === 'idle') {
      playBreakDoneSound()
      alertBreakDone()
    }
  }, [status, breakDuration])

  // Countdown tick in last 10 seconds
  useEffect(() => {
    if (secondsRemaining <= 10 && secondsRemaining > 0 && !isPaused && status !== 'idle') {
      playCountdownTick()
    }
  }, [secondsRemaining, isPaused, status])

  // Cleanup confirm timer
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    }
  }, [])

  function handleStop() {
    if (confirmingStop) {
      setConfirmingStop(false)
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
      stop()
    } else {
      setConfirmingStop(true)
      confirmTimerRef.current = setTimeout(() => setConfirmingStop(false), 3000)
    }
  }

  const isActive = status !== 'idle'
  const statusColor = status === 'working' ? 'text-accent' : status === 'break' ? 'text-success' : 'text-text-muted'

  return (
    <div className="flex items-center gap-0.5">
      <AnimatePresence mode="wait">
        {isActive ? (
          <motion.div
            key="active"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-0.5"
          >
            {/* Play/Pause */}
            <button
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
            </button>

            {/* Stop (with confirm) */}
            <button
              onClick={handleStop}
              aria-label={confirmingStop ? 'Confirmar parar Pomodoro' : 'Parar Pomodoro'}
              className="p-1 rounded hover:bg-bg-hover transition-colors"
            >
              {confirmingStop ? (
                <Check size={12} className="text-error" />
              ) : (
                <Square size={12} className="text-text-muted" />
              )}
            </button>
          </motion.div>
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

/** Default export — uses useParams for date (must be inside Router) */
export default function PomodoroTimer() {
  const { date } = useParams<{ date: string }>()
  return <PomodoroTimerCore date={date} />
}
