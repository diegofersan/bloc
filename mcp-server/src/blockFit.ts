// MIRRORS src/renderer/utils/blockFit.ts — keep behavior identical.
// Any change here MUST be replicated there (and vice versa).

import type { TaskData, TimeBlockData } from './markdown.js'

export interface FitResult {
  newEndTime: number
  desiredDuration: number
  appliedDuration: number
  clamped: 'none' | 'next-block' | 'min-duration' | 'no-op'
  overflowMinutes: number
}

export const MIN_BLOCK_DURATION = 15
const DAY_END = 1440

export function sumBlockEstimates(tasks: TaskData[]): number {
  let total = 0
  for (const t of tasks) {
    total += sumTaskTree(t)
  }
  return total
}

function sumTaskTree(task: TaskData): number {
  if (task.subtasks && task.subtasks.length > 0) {
    const subSum = sumBlockEstimates(task.subtasks)
    if (subSum > 0) return subSum
  }
  return task.estimatedMinutes ?? 0
}

export function computeBlockFit(
  block: Pick<TimeBlockData, 'startTime' | 'endTime'>,
  tasks: TaskData[],
  otherBlocksSameDay: Array<Pick<TimeBlockData, 'startTime' | 'endTime' | 'id'>>,
  blockId: string
): FitResult {
  const desired = sumBlockEstimates(tasks)
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
