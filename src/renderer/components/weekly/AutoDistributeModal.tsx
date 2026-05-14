import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, parseISO } from 'date-fns'
import { pt } from 'date-fns/locale'
import { distribute, type DistributeCandidate } from '../../../../shared/distribute'
import { dedupKey } from '../../../../shared/refs'
import type { TaskData } from '../../../../shared/types'
import { useTaskStore } from '../../stores/taskStore'
import { APP_OVERLAY_Z, portalToBody } from '../../utils/bodyPortal'

interface Props {
  open: boolean
  weekDates: string[]
  onClose: () => void
  onApply: (plan: { originDate: string; taskId: string; targetDate: string }[]) => void
}

function toTaskData(t: { id: string; text: string; completed: boolean; completedAt?: number; estimatedMinutes?: number; createdAt: number; subtasks: unknown[] }): TaskData {
  return {
    id: t.id,
    text: t.text,
    completed: t.completed,
    completedAt: t.completedAt,
    estimatedMinutes: t.estimatedMinutes,
    createdAt: t.createdAt,
    subtasks: []
  }
}

export default function AutoDistributeModal({ open, weekDates, onClose, onApply }: Props) {
  const getPendingByBlock = useTaskStore((s) => s.getPendingByBlock)
  const taskRefs = useTaskStore((s) => s.taskRefs)
  const tasks = useTaskStore((s) => s.tasks)

  const assignments = useMemo(() => {
    if (!open) return []
    const groups = getPendingByBlock()
    const weekDatesSet = new Set(weekDates)

    // Build instanceCount per origin task (refs archive-wide)
    const instanceCount = new Map<string, number>()
    for (const refList of Object.values(taskRefs)) {
      for (const r of refList) {
        const k = `${r.originDate}::${r.originTaskId}`
        instanceCount.set(k, (instanceCount.get(k) ?? 0) + 1)
      }
    }

    // existingRefsByDay restricted to week dates
    const existingRefsByDay: Record<string, Set<string>> = {}
    for (const d of weekDates) {
      const set = new Set<string>()
      const refs = taskRefs[d] ?? []
      for (const r of refs) set.add(dedupKey({ originDate: r.originDate, originTaskId: r.originTaskId }))
      existingRefsByDay[d] = set
    }

    const candidates: DistributeCandidate[] = []
    for (const g of groups) {
      const blockPendingCount = g.items.length
      for (const hit of g.items) {
        // Skip origins that fall inside the week — already on a day
        if (weekDatesSet.has(hit.originDate)) continue
        const k = `${hit.originDate}::${hit.task.id}`
        candidates.push({
          task: toTaskData(hit.task),
          originDate: hit.originDate,
          blockPendingCount,
          instanceCount: instanceCount.get(k) ?? 0
        })
      }
    }

    return distribute({ pending: candidates, days: weekDates, existingRefsByDay })
  }, [open, weekDates, getPendingByBlock, taskRefs, tasks])

  function findTitle(originDate: string, taskId: string): string {
    const list = tasks[originDate] ?? []
    function walk(arr: typeof list): string | null {
      for (const t of arr) {
        if (t.id === taskId) return t.text
        if (t.subtasks.length > 0) {
          const r = walk(t.subtasks)
          if (r) return r
        }
      }
      return null
    }
    return walk(list) ?? '(?)'
  }

  function handleApply() {
    onApply(assignments.map(({ originDate, taskId, targetDate }) => ({ originDate, taskId, targetDate })))
    onClose()
  }

  return portalToBody(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 ${APP_OVERLAY_Z} flex items-center justify-center bg-black/30`}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="bg-bg-primary border border-border rounded-xl shadow-xl w-[520px] max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-5 pt-4 pb-3 border-b border-border">
              <h3 className="text-sm font-medium text-text-primary">Distribuir automaticamente</h3>
              <p className="text-xs text-text-muted mt-0.5">
                {assignments.length === 0
                  ? 'Sem candidatos para esta semana.'
                  : `${assignments.length} ${assignments.length === 1 ? 'tarefa' : 'tarefas'} serão referenciadas`}
              </p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-2">
              {assignments.length === 0 ? (
                <div className="py-6 text-center text-xs text-text-muted">
                  Nada a distribuir.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-text-muted text-[10px] uppercase tracking-wide">
                    <tr>
                      <th className="text-left py-1.5">Tarefa</th>
                      <th className="text-left py-1.5">Para</th>
                      <th className="text-right py-1.5">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => (
                      <tr key={`${a.originDate}::${a.taskId}`} className="border-t border-border/40">
                        <td className="py-1.5 pr-2 truncate max-w-[260px]" title={findTitle(a.originDate, a.taskId)}>
                          {findTitle(a.originDate, a.taskId)}
                        </td>
                        <td className="py-1.5 pr-2 text-text-secondary">
                          {format(parseISO(a.targetDate), 'EEE d', { locale: pt })}
                        </td>
                        <td className="py-1.5 text-right text-text-muted">
                          {a.score.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="shrink-0 px-5 pb-4 pt-2 flex justify-end gap-2 border-t border-border">
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-bg-hover"
              >
                Cancelar
              </button>
              <button
                onClick={handleApply}
                disabled={assignments.length === 0}
                className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Aplicar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
