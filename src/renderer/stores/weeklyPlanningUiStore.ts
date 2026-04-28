import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * UI-only state for the weekly planning view. Persists `weekStart` (so the
 * user returns to the same week after a reload) but nothing transient like
 * drag state.
 */
interface WeeklyPlanningUiState {
  /** Monday of the currently visible week, formatted as YYYY-MM-DD. */
  weekStart: string | null
  /**
   * Task ID currently being dragged from the pending panel. Memory-only; not
   * persisted because drag is inherently transient.
   */
  draggingTaskId: string | null
  /** Origin date of the dragging task (paired with `draggingTaskId`). */
  draggingOriginDate: string | null
  /** Block ID groups that have been collapsed in the pending panel. */
  collapsedGroups: string[]

  setWeekStart: (date: string) => void
  startDrag: (originDate: string, taskId: string) => void
  endDrag: () => void
  toggleGroupCollapsed: (groupKey: string) => void
}

export const useWeeklyPlanningUiStore = create<WeeklyPlanningUiState>()(
  persist(
    (set, get) => ({
      weekStart: null,
      draggingTaskId: null,
      draggingOriginDate: null,
      collapsedGroups: [],

      setWeekStart: (date) => set({ weekStart: date }),
      startDrag: (originDate, taskId) =>
        set({ draggingOriginDate: originDate, draggingTaskId: taskId }),
      endDrag: () => set({ draggingOriginDate: null, draggingTaskId: null }),
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
      // Persist only `weekStart` — drag state is transient, collapsed groups
      // are session-only by design (T6.5 acceptance: "persists during the session").
      partialize: (state) => ({ weekStart: state.weekStart })
    }
  )
)
