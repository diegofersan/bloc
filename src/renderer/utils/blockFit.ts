// MIRRORS mcp-server/src/blockFit.ts — keep behavior identical when no
// `actualMinutesByTaskId` map is passed. The renderer additionally consults
// flow-tracked actuals for completed tasks; the MCP version has no flow data,
// so it always falls back to estimates.

import type { Task } from '../stores/taskStore'
import type { TimeBlock } from '../stores/timeBlockStore'

export interface FitResult {
  newEndTime: number
  desiredDuration: number
  appliedDuration: number
  clamped: 'none' | 'next-block' | 'min-duration' | 'no-op'
  overflowMinutes: number
}

export const MIN_BLOCK_DURATION = 15
const DAY_END = 1440

/**
 * Sum the desired duration of a block's tasks, recursing into subtasks.
 *
 * For each task:
 *  1. If completed AND `actualMinutesByTaskId` has an entry → use the actual
 *     time worked (flow-tracked). Subtasks are not consulted.
 *  2. Else, if it has subtasks whose subtree sums > 0 → use that subtree sum
 *     (anti-double-count: parent's own estimate is ignored).
 *  3. Else → use `estimatedMinutes ?? 0`.
 */
export function sumBlockEstimates(
  tasks: Task[],
  actualMinutesByTaskId?: Map<string, number>
): number {
  let total = 0
  for (const t of tasks) {
    total += sumTaskTree(t, actualMinutesByTaskId)
  }
  return total
}

function sumTaskTree(task: Task, actualMinutesByTaskId?: Map<string, number>): number {
  if (task.completed && actualMinutesByTaskId) {
    const actual = actualMinutesByTaskId.get(task.id)
    if (actual !== undefined && actual > 0) return actual
  }
  if (task.subtasks && task.subtasks.length > 0) {
    const subSum = sumBlockEstimates(task.subtasks, actualMinutesByTaskId)
    if (subSum > 0) return subSum
  }
  return task.estimatedMinutes ?? 0
}

/**
 * Compute the new endTime for a fit action. Pure: does not mutate inputs.
 *
 * Examples:
 *   block 09:00-10:00, tasks total 45m → newEndTime 09:45 (clamped: 'none')
 *   block 09:00-09:30 followed by block at 10:00, tasks total 90m
 *     → newEndTime 10:00, overflowMinutes 30, clamped: 'next-block'
 *   block 14:00-15:00, tasks total 5m → newEndTime 14:15, clamped: 'min-duration'
 *   block already aligned → clamped: 'no-op'
 *   block with no estimates → clamped: 'no-op'
 */
export function computeBlockFit(
  block: Pick<TimeBlock, 'startTime' | 'endTime'>,
  tasks: Task[],
  otherBlocksSameDay: Array<Pick<TimeBlock, 'startTime' | 'endTime' | 'id'>>,
  blockId: string,
  actualMinutesByTaskId?: Map<string, number>
): FitResult {
  const desired = sumBlockEstimates(tasks, actualMinutesByTaskId)
  const currentDuration = block.endTime - block.startTime

  if (desired === 0) {
    return {
      newEndTime: block.endTime,
      desiredDuration: 0,
      appliedDuration: currentDuration,
      clamped: 'no-op',
      overflowMinutes: 0
    }
  }

  let nextBlockStart = DAY_END
  for (const b of otherBlocksSameDay) {
    if (b.id === blockId) continue
    if (b.startTime > block.startTime && b.startTime < nextBlockStart) {
      nextBlockStart = b.startTime
    }
  }

  const desiredEnd = block.startTime + desired
  let newEnd = Math.min(desiredEnd, nextBlockStart)
  let clamped: FitResult['clamped'] = desiredEnd > nextBlockStart ? 'next-block' : 'none'
  let overflow = clamped === 'next-block' ? desiredEnd - nextBlockStart : 0

  if (newEnd - block.startTime < MIN_BLOCK_DURATION) {
    newEnd = block.startTime + MIN_BLOCK_DURATION
    if (clamped !== 'next-block') {
      clamped = 'min-duration'
      overflow = 0
    }
  }

  if (newEnd === block.endTime) {
    return {
      newEndTime: block.endTime,
      desiredDuration: desired,
      appliedDuration: currentDuration,
      clamped: 'no-op',
      overflowMinutes: 0
    }
  }

  return {
    newEndTime: newEnd,
    desiredDuration: desired,
    appliedDuration: newEnd - block.startTime,
    clamped,
    overflowMinutes: overflow
  }
}
