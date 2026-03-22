import type { Task } from '../stores/taskStore'
import { scoreComplexity } from '../services/complexityScorer'

export function getEffectiveEstimate(task: Task): number | undefined {
  return task.estimatedMinutes
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
