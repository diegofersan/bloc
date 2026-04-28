import { priorityScore } from './priority.js'
import type { PriorityWeights } from './priority.js'
import { dedupKey } from './refs.js'
import type { TaskData } from './types.js'

export interface DistributeCandidate {
  task: TaskData
  originDate: string
  blockPendingCount: number
  instanceCount: number
}

export interface DistributeInput {
  /** Pending tasks competing for slots. */
  pending: DistributeCandidate[]
  /** Days available for assignment, ordered (typically Mon..Sun). */
  days: string[]
  /**
   * Existing refs per day, keyed by dedupKey({originDate, taskId}). Used both
   * to skip duplicates and to balance load.
   */
  existingRefsByDay?: Record<string, Set<string>>
  /** Optional weight overrides forwarded to priorityScore. */
  weights?: Partial<PriorityWeights>
  /** Reference instant (test seam). Defaults to Date.now(). */
  now?: number
}

export interface Assignment {
  originDate: string
  taskId: string
  targetDate: string
  score: number
}

/**
 * Pure assignment of pending tasks to days. Strategy:
 *  1. Score each candidate via priorityScore.
 *  2. Sort descending.
 *  3. Greedy place each task on the day with the fewest current assignments,
 *     skipping days that already reference the same task.
 *
 * Stateless and deterministic given the same input + `now`.
 */
export function distribute(input: DistributeInput): Assignment[] {
  const now = input.now ?? Date.now()
  const existing = input.existingRefsByDay ?? {}

  const ranked = input.pending
    .map((p) => ({
      ...p,
      score: priorityScore(p.task, {
        blockPendingCount: p.blockPendingCount,
        instanceCount: p.instanceCount,
        now,
        weights: input.weights,
      }),
    }))
    .sort((a, b) => b.score - a.score)

  const loads: Record<string, number> = Object.fromEntries(
    input.days.map((d) => [d, 0]),
  )
  const assignments: Assignment[] = []

  for (const item of ranked) {
    const key = dedupKey({ originDate: item.originDate, originTaskId: item.task.id })
    const candidate = [...input.days]
      .filter((d) => !(existing[d]?.has(key) ?? false))
      .sort((a, b) => loads[a] - loads[b])[0]

    if (!candidate) continue // task already referenced on every available day

    assignments.push({
      originDate: item.originDate,
      taskId: item.task.id,
      targetDate: candidate,
      score: item.score,
    })
    loads[candidate] += 1
  }

  return assignments
}
