import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Kind of payload currently being dragged within the weekly planner.
 * - `pending`: from the right-side PendingPanel — drop creates a ref.
 * - `task`: an existing day-level or block-level task — drop moves it.
 * - `block`: a whole TimeBlock card — drop defers it to a different date.
 */
export type DragKind = 'pending' | 'task' | 'block' | null

/**
 * UI-only state for the weekly planning view. Persists `weekStart` (so the
 * user returns to the same week after a reload) but nothing transient like
 * drag state.
 */
interface WeeklyPlanningUiState {
  /** Monday of the currently visible week, formatted as YYYY-MM-DD. */
  weekStart: string | null

  /** What kind of payload is currently being dragged. */
  dragKind: DragKind
  /** Origin date (YYYY-MM-DD) of the dragged item. */
  draggingOriginDate: string | null
  /** Block id of origin (for `task` from a block, or for `block` itself). null otherwise. */
  draggingOriginBlockId: string | null
  /** Task id of the dragged task (for `pending` and `task`). null for `block`. */
  draggingTaskId: string | null
  /** Block id being dragged (for `block`). null otherwise. */
  draggingBlockId: string | null

  /** Block ID groups that have been collapsed in the pending panel. */
  collapsedGroups: string[]

  setWeekStart: (date: string) => void
  startPendingDrag: (originDate: string, taskId: string) => void
  startTaskDrag: (originDate: string, originBlockId: string | null, taskId: string) => void
  startBlockDrag: (originDate: string, blockId: string) => void
  endDrag: () => void
  toggleGroupCollapsed: (groupKey: string) => void
}

const EMPTY_DRAG = {
  dragKind: null as DragKind,
  draggingOriginDate: null,
  draggingOriginBlockId: null,
  draggingTaskId: null,
  draggingBlockId: null
}

export const useWeeklyPlanningUiStore = create<WeeklyPlanningUiState>()(
  persist(
    (set, get) => ({
      weekStart: null,
      ...EMPTY_DRAG,
      collapsedGroups: [],

      setWeekStart: (date) => set({ weekStart: date }),

      startPendingDrag: (originDate, taskId) =>
        set({
          ...EMPTY_DRAG,
          dragKind: 'pending',
          draggingOriginDate: originDate,
          draggingTaskId: taskId
        }),

      startTaskDrag: (originDate, originBlockId, taskId) =>
        set({
          ...EMPTY_DRAG,
          dragKind: 'task',
          draggingOriginDate: originDate,
          draggingOriginBlockId: originBlockId,
          draggingTaskId: taskId
        }),

      startBlockDrag: (originDate, blockId) =>
        set({
          ...EMPTY_DRAG,
          dragKind: 'block',
          draggingOriginDate: originDate,
          draggingBlockId: blockId
        }),

      endDrag: () => set({ ...EMPTY_DRAG }),

      toggleGroupCollapsed: (groupKey) => {
        const list = get().collapsedGroups
        const next = list.includes(groupKey)
          ? list.filter((k) => k !== groupKey)
          : [...list, groupKey]
        set({ collapsedGroups: next })
      }
    }),
    {
      name: 'bloc-weekly-planning-ui',
      partialize: (state) => ({ weekStart: state.weekStart })
    }
  )
)
