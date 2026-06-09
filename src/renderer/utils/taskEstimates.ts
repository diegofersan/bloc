import type { Task } from '../stores/taskStore'
import { scoreComplexity } from '../services/complexityScorer'

export function getEffectiveEstimate(task: Task): number | undefined {
  return task.estimatedMinutes
}

/**
 * Sum the estimates of a task's pending (non-completed, non-wontDo) subtasks,
 * recursively. Returns 0 if there are no pending subtasks. Anti-double-count:
 * a parent's own `estimatedMinutes` is ignored when it has subtasks — the
 * subtree is the source of truth.
 */
export function sumPendingSubtaskEstimates(task: Task): number {
  if (!task.subtasks || task.subtasks.length === 0) return 0
  let total = 0
  for (const st of task.subtasks) {
    if (st.completed || st.wontDo) continue
    if (st.subtasks && st.subtasks.length > 0) {
      total += sumPendingSubtaskEstimates(st)
    } else {
      total += st.estimatedMinutes ?? 0
    }
  }
  return total
}

export function getSuggestedEstimate(task: Task): number | undefined {
  if (task.estimatedMinutes !== undefined) return undefined
  if (task.text.trim().length < 3) return undefined
  const score = scoreComplexity(task.text)
  return score.estimatedMinutes
}

export function formatEstimate(minutes: number): string {
  if (minutes < 60) return `~${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return `~${h}h`
  return `~${h}h${m}m`
}
