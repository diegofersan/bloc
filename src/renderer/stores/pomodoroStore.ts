import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { format } from 'date-fns'

export type PomodoroStatus = 'idle' | 'working' | 'break'

interface PomodoroState {
  workDuration: number
  breakDuration: number
  status: PomodoroStatus
  isPaused: boolean
  secondsRemaining: number
  totalSeconds: number
  startedAt: number | null
  expectedEndAt: number | null
  setWorkDuration: (minutes: number) => void
  setBreakDuration: (minutes: number) => void
  startWork: () => void
  startBreak: () => void
  tick: () => void
  stop: () => void
  pause: () => void
  resume: () => void
  completedPomodoros: Record<string, number>
  getCompletedForDate: (date: string) => number
  getDatesWithPomodoros: () => string[]
}

export const usePomodoroStore = create<PomodoroState>()(
  persist(
    (set, get) => ({
      workDuration: 25,
      breakDuration: 5,
      completedPomodoros: {},
      status: 'idle',
      isPaused: false,
      secondsRemaining: 0,
      totalSeconds: 0,
      startedAt: null,
      expectedEndAt: null,

      setWorkDuration: (minutes: number) => set({ workDuration: minutes }),

      setBreakDuration: (minutes: number) => set({ breakDuration: minutes }),

      startWork: () => {
        const seconds = get().workDuration * 60
        const now = Date.now()
        set({
          status: 'working',
          isPaused: false,
          secondsRemaining: seconds,
          totalSeconds: seconds,
          startedAt: now,
          expectedEndAt: now + seconds * 1000
        })
      },

      startBreak: () => {
        const seconds = get().breakDuration * 60
        const now = Date.now()
        set({
          status: 'break',
          isPaused: false,
          secondsRemaining: seconds,
          totalSeconds: seconds,
          startedAt: now,
          expectedEndAt: now + seconds * 1000
        })
      },

      tick: () => {
        const { expectedEndAt, status, breakDuration, isPaused } = get()
        if (isPaused || !expectedEndAt) return

        const remaining = Math.max(0, Math.round((expectedEndAt - Date.now()) / 1000))

        if (remaining > 0) {
          set({ secondsRemaining: remaining })
        } else {
          if (status === 'working') {
            const today = format(new Date(), 'yyyy-MM-dd')
            const current = get().completedPomodoros[today] || 0
            const seconds = breakDuration * 60
            const now = Date.now()
            set({
              status: 'break',
              isPaused: false,
              secondsRemaining: seconds,
              totalSeconds: seconds,
              startedAt: now,
              expectedEndAt: now + seconds * 1000,
              completedPomodoros: { ...get().completedPomodoros, [today]: current + 1 }
            })
          } else if (status === 'break') {
            set({
              status: 'idle',
              isPaused: false,
              secondsRemaining: 0,
              totalSeconds: 0,
              startedAt: null,
              expectedEndAt: null
            })
          }
        }
      },

      stop: () => set({
        status: 'idle',
        isPaused: false,
        secondsRemaining: 0,
        totalSeconds: 0,
        startedAt: null,
        expectedEndAt: null
      }),

      pause: () => set({ isPaused: true }),

      resume: () => {
        const { secondsRemaining } = get()
        const now = Date.now()
        set({
          isPaused: false,
          expectedEndAt: now + secondsRemaining * 1000
        })
      },

      getCompletedForDate: (date) => get().completedPomodoros[date] || 0,

      getDatesWithPomodoros: () => Object.keys(get().completedPomodoros).filter(d => get().completedPomodoros[d] > 0)
    }),
    {
      name: 'bloc-pomodoro',
      partialize: (state) => ({ workDuration: state.workDuration, breakDuration: state.breakDuration, completedPomodoros: state.completedPomodoros })
    }
  )
)
