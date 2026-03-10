import { useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, parseISO, differenceInDays } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useTaskStore, BACKLOG_KEY, type Task } from '../stores/taskStore'

const RINGS = 10

interface RadarTask {
  id: string
  text: string
  date: string          // original date key
  baseDate: string      // YYYY-MM-DD or BACKLOG_KEY
  age: number           // days since creation
  ring: number          // 0 (center) → 9 (edge)
  angle: number         // radians for placement
  subtasksDone: number
  subtasksTotal: number
}

function countSubtasks(subtasks: Task[]): { done: number; total: number } {
  let done = 0, total = 0
  for (const s of subtasks) {
    total++
    if (s.completed) done++
    if (s.subtasks.length > 0) {
      const nested = countSubtasks(s.subtasks)
      done += nested.done
      total += nested.total
    }
  }
  return { done, total }
}

export default function RadarView() {
  const navigate = useNavigate()
  const tasks = useTaskStore((s) => s.tasks)
  const [hoveredTask, setHoveredTask] = useState<RadarTask | null>(null)
  const [selectedTask, setSelectedTask] = useState<RadarTask | null>(null)

  const radarTasks = useMemo(() => {
    const now = new Date()
    const items: RadarTask[] = []

    for (const [dateKey, taskList] of Object.entries(tasks)) {
      const blockMatch = dateKey.match(/^(.+)__block__(.+)$/)
      const baseDate = blockMatch ? blockMatch[1] : dateKey

      for (const task of taskList) {
        if (task.completed) continue
        if (!task.text.trim()) continue

        const age = dateKey === BACKLOG_KEY
          ? differenceInDays(now, task.createdAt)
          : differenceInDays(now, parseISO(baseDate))

        const sub = countSubtasks(task.subtasks)

        items.push({
          id: task.id,
          text: task.text,
          date: dateKey,
          baseDate,
          age: Math.max(0, age),
          ring: 0,
          angle: 0,
          subtasksDone: sub.done,
          subtasksTotal: sub.total,
        })
      }
    }

    if (items.length === 0) return []

    // Sort by age descending (oldest first)
    items.sort((a, b) => b.age - a.age)

    // Assign rings: distribute tasks across 10 rings by age percentile
    const maxAge = items[0].age
    for (const item of items) {
      if (maxAge === 0) {
        item.ring = 0
      } else {
        // age 0 → ring 0 (center), maxAge → ring 9 (edge)
        item.ring = Math.min(RINGS - 1, Math.floor((item.age / maxAge) * (RINGS - 0.01)))
      }
    }

    // Assign angles: spread tasks within each ring
    const byRing = new Map<number, RadarTask[]>()
    for (const item of items) {
      const list = byRing.get(item.ring)
      if (list) list.push(item)
      else byRing.set(item.ring, [item])
    }

    for (const [, ringTasks] of byRing) {
      const offset = Math.random() * Math.PI * 2 // random start per ring
      ringTasks.forEach((task, i) => {
        task.angle = offset + (i / ringTasks.length) * Math.PI * 2
      })
    }

    return items
  }, [tasks])

  const handleTaskClick = useCallback((task: RadarTask) => {
    setSelectedTask((prev) => prev?.id === task.id ? null : task)
  }, [])

  const handleNavigate = useCallback((task: RadarTask) => {
    if (task.baseDate === BACKLOG_KEY) {
      navigate('/inbox?tab=tasks')
    } else {
      navigate(`/day/${task.baseDate}`)
    }
  }, [navigate])

  const activeTask = selectedTask || hoveredTask

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Titlebar */}
      <div className="titlebar-drag shrink-0 flex items-end justify-between px-5 pt-[50px] pb-2">
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/')}
            aria-label="Voltar"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors"
          >
            <ArrowLeft size={18} />
          </motion.button>
          <h2 className="text-sm font-medium text-text-secondary">Radar</h2>
        </div>
        <div className="text-xs text-text-muted" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {radarTasks.length} {radarTasks.length === 1 ? 'tarefa pendente' : 'tarefas pendentes'}
        </div>
      </div>

      {/* Radar */}
      <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
        {radarTasks.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <p className="text-lg font-medium text-text-primary mb-1">Radar limpo.</p>
            <p className="text-sm text-text-muted">Sem tarefas pendentes.</p>
          </motion.div>
        ) : (
          <div className="relative w-full max-w-[560px] aspect-square">
            <svg viewBox="0 0 400 400" className="w-full h-full">
              {/* Concentric rings */}
              {Array.from({ length: RINGS }, (_, i) => {
                const r = ((i + 1) / RINGS) * 180
                return (
                  <circle
                    key={i}
                    cx={200}
                    cy={200}
                    r={r}
                    fill="none"
                    stroke="currentColor"
                    className="text-border"
                    strokeWidth={i === RINGS - 1 ? 1.5 : 0.5}
                    opacity={0.3 + (i / RINGS) * 0.4}
                  />
                )
              })}

              {/* Cross-hairs */}
              <line x1={200} y1={20} x2={200} y2={380} stroke="currentColor" className="text-border" strokeWidth={0.5} opacity={0.2} />
              <line x1={20} y1={200} x2={380} y2={200} stroke="currentColor" className="text-border" strokeWidth={0.5} opacity={0.2} />

              {/* Sweep line animation — SMIL animateTransform for reliable center rotation */}
              <g>
                <line
                  x1={200}
                  y1={200}
                  x2={200}
                  y2={20}
                  stroke="currentColor"
                  className="text-accent"
                  strokeWidth={1}
                  opacity={0.15}
                />
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 200 200"
                  to="360 200 200"
                  dur="8s"
                  repeatCount="indefinite"
                />
              </g>

              {/* Task dots */}
              {radarTasks.map((task) => {
                const ringRadius = ((task.ring + 0.5) / RINGS) * 180
                const cx = 200 + Math.cos(task.angle) * ringRadius
                const cy = 200 + Math.sin(task.angle) * ringRadius
                const isActive = activeTask?.id === task.id
                const dotR = isActive ? 7 : 4.5
                // Color by age: recent=accent, old=distraction
                const intensity = task.ring / (RINGS - 1)

                return (
                  <g key={task.id}>
                    {/* Glow for active */}
                    {isActive && (
                      <motion.circle
                        cx={cx}
                        cy={cy}
                        r={12}
                        fill="currentColor"
                        className="text-accent"
                        opacity={0.15}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 0.15 }}
                      />
                    )}
                    <motion.circle
                      cx={cx}
                      cy={cy}
                      r={dotR}
                      className="cursor-pointer"
                      fill={intensity > 0.7 ? '#ef4444' : intensity > 0.4 ? '#f59e0b' : 'var(--color-accent)'}
                      opacity={isActive ? 1 : 0.8}
                      whileHover={{ scale: 1.4 }}
                      onMouseEnter={() => setHoveredTask(task)}
                      onMouseLeave={() => setHoveredTask(null)}
                      onClick={() => handleTaskClick(task)}
                      style={{ filter: isActive ? 'drop-shadow(0 0 4px currentColor)' : undefined }}
                    />
                  </g>
                )
              })}

              {/* Center dot */}
              <circle cx={200} cy={200} r={3} fill="currentColor" className="text-accent" opacity={0.6} />
            </svg>

            {/* Tooltip */}
            <AnimatePresence>
              {activeTask && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full mt-2 w-[min(90%,320px)] bg-bg-secondary border border-border rounded-xl px-4 py-3 shadow-lg z-10"
                >
                  <p className="text-sm font-medium text-text-primary truncate">{activeTask.text}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-text-muted">
                      {activeTask.baseDate === BACKLOG_KEY
                        ? 'Sem data'
                        : format(parseISO(activeTask.baseDate), "d 'de' MMMM", { locale: pt })
                      }
                    </span>
                    <span className="text-xs text-text-muted">
                      {activeTask.age === 0 ? 'Hoje' : activeTask.age === 1 ? 'Há 1 dia' : `Há ${activeTask.age} dias`}
                    </span>
                    {activeTask.subtasksTotal > 0 && (
                      <span className="text-xs text-text-muted">
                        {activeTask.subtasksDone}/{activeTask.subtasksTotal} subtarefas
                      </span>
                    )}
                  </div>
                  {selectedTask?.id === activeTask.id && (
                    <button
                      onClick={() => handleNavigate(activeTask)}
                      className="mt-2 text-xs font-medium text-accent hover:underline"
                    >
                      {activeTask.baseDate === BACKLOG_KEY ? 'Ir para tarefas' : 'Ir para o dia'}
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Legend */}
            <div className="absolute top-2 right-2 flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-accent" />
                <span className="text-[10px] text-text-muted">Recentes</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
                <span className="text-[10px] text-text-muted">A envelhecer</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                <span className="text-[10px] text-text-muted">A sair do radar</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
