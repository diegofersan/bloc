import type { TaskData } from './types.js'

/**
 * Weights used by priorityScore. Constants so the algorithm is reproducible
 * across renderer and MCP. Tweak by editing this file or by passing overrides
 * via the auto-distribute call site.
 */
export const DEFAULT_PRIORITY_WEIGHTS = {
  age: 0.4,
  instances: 0.3,
  estimate: 0.1,
  blockLoad: 0.2,
} as const

export type PriorityWeights = typeof DEFAULT_PRIORITY_WEIGHTS

export interface PriorityContext {
  /** Number of pending tasks under the same parent block. */
  blockPendingCount: number
  /** Number of times the task has been instantiated as a ref elsewhere. */
  instanceCount: number
  /** Reference instant. Caller passes Date.now() for production use. */
  now: number
  /** Weights override (partial — missing keys fall back to defaults). */
  weights?: Partial<PriorityWeights>
}

const MAX_AGE_DAYS = 30
const MAX_INSTANCES = 10
const MAX_ESTIMATE_BIN = 4 // bin = estimate/30
const MAX_BLOCK_LOAD = 20

/**
 * Priority score in [0, 1]. Higher = more urgent. Pure function — same inputs
 * yield same output.
 *
 * Signal mix:
 *  - age: how long the task has been pending (rotting).
 *  - instances: how many times it has been re-scheduled (chased).
 *  - estimate: heavier tasks slot in first.
 *  - blockLoad: tasks under a backlogged parent get a small boost.
 */
export function priorityScore(task: TaskData, ctx: PriorityContext): number {
  const w = { ...DEFAULT_PRIORITY_WEIGHTS, ...(ctx.weights ?? {}) }

  const ageDays = Math.max(0, (ctx.now - task.createdAt) / 86_400_000)
  const ageNorm = Math.min(ageDays, MAX_AGE_DAYS) / MAX_AGE_DAYS

  const instNorm = Math.min(ctx.instanceCount, MAX_INSTANCES) / MAX_INSTANCES

  const estimateBin = (task.estimatedMinutes ?? 0) / 30
  const estimateNorm = Math.min(estimateBin, MAX_ESTIMATE_BIN) / MAX_ESTIMATE_BIN

  const blockNorm = Math.min(ctx.blockPendingCount, MAX_BLOCK_LOAD) / MAX_BLOCK_LOAD

  return (
    w.age * ageNorm +
    w.instances * instNorm +
    w.estimate * estimateNorm +
    w.blockLoad * blockNorm
  )
}
