// MIRRORS mcp-server/src/blockFit.ts — keep behavior identical when no
// `actualMinutesByTaskId` map is passed. The renderer additionally consults
// flow-tracked actuals for completed tasks; the MCP version has no flow data,
// so it always falls back to estimates.

import type { Task, TaskRef } from '../stores/taskStore'
import type { TimeBlock, UntimedBlock } from '../stores/timeBlockStore'

export interface FitResult {
  newEndTime: number
  desiredDuration: number
  appliedDuration: number
  clamped: 'none' | 'next-block' | 'min-duration' | 'no-op'
  overflowMinutes: number
}

export const MIN_BLOCK_DURATION = 15
const DAY_END = 1440

function findTaskInTree(list: Task[], id: string): Task | null {
  for (const t of list) {
    if (t.id === id) return t
    if (t.subtasks.length > 0) {
      const found = findTaskInTree(t.subtasks, id)
      if (found) return found
    }
  }
  return null
}

/**
 * Collect the tasks that belong to a TimeBlock for fit/count purposes.
 *
 * Combines:
 *  1. Explicit tasks at storeKey `<date>__block__<id>`.
 *  2. Tasks resolved via `taskRefs[<date>]` whose origin is an untimed block
 *     sharing the same (case-insensitive trimmed) title — only pending ones
 *     (not completed, not wontDo).
 *
 * Pure: caller passes the relevant slice of state.
 */
export function collectBlockTasks(
  block: Pick<TimeBlock, 'id' | 'date' | 'title'>,
  state: {
    tasks: Record<string, Task[]>
    taskRefs: Record<string, TaskRef[]>
  },
  untimedBlocks: UntimedBlock[]
): Task[] {
  const blockKey = `${block.date}__block__${block.id}`
  const explicit = state.tasks[blockKey] ?? []

  const titleNorm = block.title?.trim().toLowerCase()
  if (!titleNorm) return [...explicit]

  const matchingUntimedIds = new Set(
    untimedBlocks
      .filter((ub) => ub.title.trim().toLowerCase() === titleNorm)
      .map((ub) => ub.id)
  )
  if (matchingUntimedIds.size === 0) return [...explicit]

  const refs = state.taskRefs[block.date] ?? []
  const refTasks: Task[] = []
  for (const ref of refs) {
    if (!ref.originDate.startsWith('__block__')) continue
    const untimedId = ref.originDate.slice('__block__'.length)
    if (!matchingUntimedIds.has(untimedId)) continue
    const originList = state.tasks[ref.originDate]
    if (!originList) continue
    const found = findTaskInTree(originList, ref.originTaskId)
    if (found && !found.completed && !found.wontDo) {
      refTasks.push(found)
    }
  }

  return [...explicit, ...refTasks]
}

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
