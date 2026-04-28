import type { TaskRefData } from './types.js'

/** Generate a new UUID for a reference. Uses platform crypto. */
export function makeRefId(): string {
  return crypto.randomUUID()
}

/**
 * Stable key identifying a logical reference: the same origin pointing into
 * the same task. Used to deduplicate when applying many refs at once.
 */
export function dedupKey(ref: { originDate: string; originTaskId: string }): string {
  return `${ref.originDate}::${ref.originTaskId}`
}

export function isSameRef(a: TaskRefData, b: TaskRefData): boolean {
  return a.originDate === b.originDate && a.originTaskId === b.originTaskId
}
