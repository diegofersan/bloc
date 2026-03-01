import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Square, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePomodoroStore } from '../stores/pomodoroStore'
import { playWorkDoneSound, playBreakDoneSound, playCountdownTick } from '../services/notificationSound'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function PomodoroTimer() {
  const { status, isPaused, secondsRemaining, totalSeconds, startWork, pause, resume, stop } =
    usePomodoroStore()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tick = usePomodoroStore((s) => s.tick)
  const [confirmingStop, setConfirmingStop] = useState(false)

  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
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
    const label = status === 'working' ? 'Foco' : 'Pausa'
    const pauseIndicator = isPaused ? ' ⏸' : ''
    window.bloc?.updatePomodoroTray(`${time} ${label}${pauseIndicator}`, status)
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

  function handleSkipBreak() {
    startWork()
  }

  const progress = totalSeconds > 0 ? (totalSeconds - secondsRemaining) / totalSeconds : 0
  const isActive = status !== 'idle'
  const statusColor = status === 'working' ? 'text-accent' : status === 'break' ? 'text-success' : 'text-text-muted'
  const progressColor = status === 'working' ? 'bg-accent' : 'bg-success'

  return (
    <div className="flex items-center gap-2">
      <AnimatePresence mode="wait">
        {isActive ? (
          <motion.div
            key="active"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-2"
          >
            {/* Progress bar */}
            <div className={`${isNarrow ? 'w-16' : 'w-24'} h-1 rounded-full bg-bg-tertiary overflow-hidden`} role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <motion.div
                className={`h-full rounded-full ${progressColor}`}
                initial={false}
                animate={isPaused
                  ? { width: `${progress * 100}%`, opacity: [1, 0.4, 1] }
                  : { width: `${progress * 100}%`, opacity: 1 }
                }
                transition={isPaused
                  ? { width: { duration: 0.5, ease: 'linear' }, opacity: { repeat: Infinity, duration: 1.5 } }
                  : { duration: 0.5, ease: 'linear' }
                }
              />
            </div>

            {/* Time display */}
            <span role="timer" aria-live="off" className={`text-xs font-medium tabular-nums ${statusColor}`}>
              {formatTime(secondsRemaining)}
            </span>

            {/* Status label */}
            {!isNarrow && (
              <span className="text-xs text-text-muted uppercase tracking-wider">
                {status === 'working' ? 'Foco' : 'Pausa'}
              </span>
            )}

            {/* Skip break button */}
            {status === 'break' && (
              <button
                onClick={handleSkipBreak}
                aria-label="Saltar pausa e iniciar foco"
                className="p-1 rounded hover:bg-bg-hover transition-colors"
              >
                <Play size={12} className="text-accent" />
              </button>
            )}

            {/* Pause/Resume */}
            <button
              onClick={isPaused ? resume : pause}
              aria-label={isPaused ? 'Retomar timer' : 'Pausar timer'}
              className="p-1 rounded hover:bg-bg-hover transition-colors"
            >
              {isPaused ? (
                <Play size={12} className="text-text-secondary" />
              ) : (
                <Pause size={12} className="text-text-secondary" />
              )}
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
            onClick={startWork}
            aria-label="Iniciar Pomodoro"
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors"
          >
            <Play size={12} />
            <span className="text-xs font-medium">Pomodoro</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
