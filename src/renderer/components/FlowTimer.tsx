import { useEffect, useRef } from 'react'
import { Play, Pause, Square, SkipForward } from 'lucide-react'
import { motion } from 'framer-motion'
import { useFlowStore } from '../stores/flowStore'
import { playWorkDoneSound, playBreakDoneSound, playCountdownTick } from '../services/notificationSound'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface FlowTimerProps {
  compact?: boolean
}

export default function FlowTimer({ compact }: FlowTimerProps) {
  const isActive = useFlowStore((s) => s.isActive)
  const isPaused = useFlowStore((s) => s.isPaused)
  const phase = useFlowStore((s) => s.phase)
  const queue = useFlowStore((s) => s.queue)
  const currentIndex = useFlowStore((s) => s.currentIndex)
  const tick = useFlowStore((s) => s.tick)
  const pause = useFlowStore((s) => s.pause)
  const resume = useFlowStore((s) => s.resume)
  const deactivate = useFlowStore((s) => s.deactivate)
  const skipCurrentTask = useFlowStore((s) => s.skipCurrentTask)
  const secondsRemaining = useFlowStore((s) => s.secondsRemaining)
  const completedPomodoros = useFlowStore((s) => s.completedPomodoros)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Tick interval
  useEffect(() => {
    if (isActive && !isPaused) {
      intervalRef.current = setInterval(tick, 1000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isActive, isPaused, tick])

  // Sound effects on phase transitions + countdown ticks
  const prevPhaseRef = useRef(phase)
  useEffect(() => {
    const prev = prevPhaseRef.current
    prevPhaseRef.current = phase
    if (prev === 'working' && phase === 'break') playWorkDoneSound()
    if (prev === 'break' && phase === 'working') playBreakDoneSound()
  }, [phase])

  useEffect(() => {
    if (secondsRemaining <= 10 && secondsRemaining > 0 && !isPaused && isActive) {
      playCountdownTick()
    }
  }, [secondsRemaining, isPaused, isActive])

  if (!isActive || currentIndex < 0 || currentIndex >= queue.length) return null

  const remaining = secondsRemaining
  const isOnBreak = phase === 'break'

  // Completed / total
  const completed = queue.filter((q) => q.status === 'completed').length
  const total = queue.length

  const phaseColor = isOnBreak ? 'text-success' : 'text-violet-500'
  const phaseBg = isOnBreak ? 'bg-success' : 'bg-violet-500'

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={isPaused ? resume : pause}
          className="p-0.5 rounded hover:bg-bg-hover transition-colors"
          aria-label={isPaused ? 'Retomar fluxo' : 'Pausar fluxo'}
        >
          {isPaused ? (
            <Play size={12} className={phaseColor} />
          ) : (
            <Pause size={12} className={phaseColor} />
          )}
        </button>
        <span className={`text-xs font-medium tabular-nums ${phaseColor}`}>
          {formatTime(remaining)}
        </span>
        {!isOnBreak && (
          <button
            onClick={skipCurrentTask}
            className="p-0.5 rounded hover:bg-bg-hover transition-colors"
            aria-label="Saltar tarefa"
          >
            <SkipForward size={10} className="text-text-muted" />
          </button>
        )}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between"
    >
      <div className="flex items-center gap-3">
        {/* Timer */}
        <span className={`text-lg font-medium tabular-nums ${phaseColor}`}>
          {formatTime(remaining)}
        </span>

        {/* Phase label */}
        <span className={`text-[10px] font-medium uppercase tracking-wider ${phaseColor}`}>
          {isOnBreak ? 'Pausa' : 'Foco'}
        </span>

        {/* Pomodoro dots */}
        {completedPomodoros > 0 && (
          <div className="flex items-center gap-0.5">
            {Array.from({ length: Math.min(completedPomodoros, 6) }).map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full ${phaseBg}`} />
            ))}
            {completedPomodoros > 6 && (
              <span className="text-[9px] text-text-muted">+{completedPomodoros - 6}</span>
            )}
          </div>
        )}

        {/* Progress counter */}
        <span className="text-[10px] text-text-muted tabular-nums">
          {completed}/{total}
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        {!isOnBreak && (
          <button
            onClick={skipCurrentTask}
            className="p-1.5 rounded hover:bg-bg-hover transition-colors"
            aria-label="Saltar tarefa"
            title="Saltar"
          >
            <SkipForward size={14} className="text-text-muted hover:text-text-secondary" />
          </button>
        )}
        <button
          onClick={isPaused ? resume : pause}
          className="p-1.5 rounded hover:bg-bg-hover transition-colors"
          aria-label={isPaused ? 'Retomar' : 'Pausar'}
        >
          {isPaused ? (
            <Play size={14} className={phaseColor} />
          ) : (
            <Pause size={14} className={phaseColor} />
          )}
        </button>
        <button
          onClick={deactivate}
          className="p-1.5 rounded hover:bg-bg-hover transition-colors"
          aria-label="Parar fluxo"
          title="Parar"
        >
          <Square size={12} className="text-text-muted hover:text-text-secondary" />
        </button>
      </div>
    </motion.div>
  )
}
