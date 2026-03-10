import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePomodoroStore } from '../stores/pomodoroStore'
import { useSettingsStore } from '../stores/settingsStore'

interface Particle {
  id: number
  x: number
  y: number
  rotation: number
  scale: number
  color: string
  delay: number
}

const WORK_COLORS = ['#6366f1', '#818cf8', '#a78bfa', '#c084fc', '#8b5cf6']
const BREAK_COLORS = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#059669']

const PARTICLE_COUNT = 18

function createParticles(colors: string[]): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (Math.PI * 2 * i) / PARTICLE_COUNT + (Math.random() - 0.5) * 0.4
    const distance = 120 + Math.random() * 160
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      rotation: Math.random() * 720 - 360,
      scale: 0.5 + Math.random() * 0.8,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.08
    }
  })
}

export default function BlockExplosion() {
  const confettiOn = useSettingsStore((s) => s.confettiOnComplete)
  const status = usePomodoroStore((s) => s.status)
  const [burst, setBurst] = useState<{ particles: Particle[]; key: number } | null>(null)
  const prevStatusRef = useRef(status)

  const triggerBurst = useCallback((type: 'work' | 'break') => {
    const colors = type === 'work' ? WORK_COLORS : BREAK_COLORS
    setBurst({ particles: createParticles(colors), key: Date.now() })
    setTimeout(() => setBurst(null), 1200)
  }, [])

  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = status

    if (!confettiOn) return

    if (prev === 'working' && status === 'break') {
      window.bloc?.focusWindow()
      triggerBurst('work')
    } else if (prev === 'break' && status === 'idle') {
      window.bloc?.focusWindow()
      triggerBurst('break')
    }
  }, [status, confettiOn, triggerBurst])

  return (
    <AnimatePresence>
      {burst && (
        <motion.div
          key={burst.key}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center"
        >
          {burst.particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ x: 0, y: 0, scale: 0, rotate: 0, opacity: 1 }}
              animate={{
                x: p.x,
                y: p.y,
                scale: p.scale,
                rotate: p.rotation,
                opacity: 0
              }}
              transition={{
                duration: 0.8 + Math.random() * 0.3,
                delay: p.delay,
                ease: [0.25, 0.46, 0.45, 0.94]
              }}
              style={{ backgroundColor: p.color }}
              className="absolute w-3 h-3 rounded-sm"
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
