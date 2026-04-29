// Single source of types shared between the renderer and the MCP server.
// These represent the canonical Markdown schema. Renderer-only or MCP-only
// runtime types (e.g. Zustand-internal flags) live in their respective
// packages.

export interface TaskData {
  id: string
  text: string
  completed: boolean
  completedAt?: number
  wontDo?: boolean
  wontDoAt?: number
  estimatedMinutes?: number
  createdAt: number
  subtasks: TaskData[]
}

export type DistractionStatus = 'pending' | 'dismissed' | 'converted'

export interface DistractionData {
  id: string
  text: string
  createdAt: number
  status: DistractionStatus
  processedAt?: number
}

export type TimeBlockColor =
  | 'indigo'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'sky'
  | 'violet'
  | 'slate'

export interface TimeBlockData {
  id: string
  startTime: number
  endTime: number
  title: string
  color: TimeBlockColor
  createdAt: number
  updatedAt: number
  googleEventId?: string
  isGoogleReadOnly?: boolean
  /** True for blocks without a calendar instance (project-mode). */
  untimed?: boolean
}

/**
 * Untimed block stored at iCloud root in `blocks.md`. Has no date/start/end —
 * acts as a project container for tasks. Tasks live under storeKey
 * `__block__<id>` (no date prefix).
 */
export interface UntimedBlockData {
  id: string
  title: string
  color: TimeBlockColor
  createdAt: number
  updatedAt: number
}

export interface BlocksFileData {
  untimedBlocks: UntimedBlockData[]
  /** Keys are storeKeys of the form `__block__<blockId>`. */
  tasks: Record<string, TaskData[]>
}

/**
 * Cross-day pointer to a task that lives elsewhere. Persisted in the target
 * day's Markdown file under the `## Referências` section. Source of truth for
 * completion state remains the origin task — refs do not carry their own
 * checkbox.
 */
export interface TaskRefData {
  /** UUID of this reference. */
  id: string
  /** Date (YYYY-MM-DD) where the origin task lives. */
  originDate: string
  /** ID of the origin task. */
  originTaskId: string
  /**
   * Snapshot of the origin task title at ref-creation time. Best-effort —
   * may go stale if the origin is later renamed; refreshed on next save.
   */
  titleSnapshot: string
  /** Timestamp the ref was added. */
  addedAt: number
}

export interface DayFileData {
  date: string
  pomodoros: number
  updatedAt: number
  tasks: TaskData[]
  distractions: DistractionData[]
  timeBlocks?: TimeBlockData[]
  blockTasks?: Record<string, TaskData[]>
  /** Refs assigned to this day. */
  refs?: TaskRefData[]
  /**
   * Raw bodies of `## Foo` sections the parser did not recognise. Preserved on
   * round-trip so that a Bloc version unaware of a future section does not
   * silently drop it. Keys are the section heading without the `## ` prefix.
   */
  unknownSections?: Record<string, string>
}
