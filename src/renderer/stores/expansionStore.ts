import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ExpansionEvent, UserProfile, TaskCategory } from '../services/expansionTypes'

const MAX_EVENTS = 200

interface ExpansionState {
  events: ExpansionEvent[]
  profile: UserProfile
  recordExpansion: (event: Omit<ExpansionEvent, 'id' | 'timestamp'>) => string
  recordAcceptance: (eventId: string, accepted: number) => void
  getProfile: () => UserProfile
  getRecentEvents: (n: number) => ExpansionEvent[]
}

function recalculateProfile(events: ExpansionEvent[]): UserProfile {
  const totalExpansions = events.length
  const withAcceptance = events.filter(e => e.subtasksAccepted !== undefined)

  const avgSubtasksAccepted = withAcceptance.length > 0
    ? withAcceptance.reduce((sum, e) => sum + (e.subtasksAccepted ?? 0), 0) / withAcceptance.length
    : 0

  const avgSubtasksPerExpansion = totalExpansions > 0
    ? events.reduce((sum, e) => sum + e.subtasksGenerated, 0) / totalExpansions
    : 0

  const preferredCategories = {} as Record<TaskCategory, number>
  for (const e of events) {
    preferredCategories[e.category] = (preferredCategories[e.category] ?? 0) + 1
  }

  return {
    totalExpansions,
    avgSubtasksAccepted,
    avgSubtasksPerExpansion,
    preferredCategories,
    lastUpdated: Date.now()
  }
}

export const useExpansionStore = create<ExpansionState>()(
  persist(
    (set, get) => ({
      events: [],
      profile: {
        totalExpansions: 0,
        avgSubtasksAccepted: 0,
        avgSubtasksPerExpansion: 0,
        preferredCategories: {} as Record<TaskCategory, number>,
        lastUpdated: Date.now()
      },

      recordExpansion: (event) => {
        const id = crypto.randomUUID()
        const full: ExpansionEvent = { ...event, id, timestamp: Date.now() }

        set((state) => {
          const events = [...state.events, full]
          // FIFO: keep max 200 events
          while (events.length > MAX_EVENTS) {
            events.shift()
          }
          return { events, profile: recalculateProfile(events) }
        })

        return id
      },

      recordAcceptance: (eventId, accepted) => {
        set((state) => {
          const events = state.events.map(e =>
            e.id === eventId ? { ...e, subtasksAccepted: accepted } : e
          )
          return { events, profile: recalculateProfile(events) }
        })
      },

      getProfile: () => get().profile,

      getRecentEvents: (n) => {
        const events = get().events
        return events.slice(-n)
      }
    }),
    {
      name: 'bloc-expansion'
    }
  )
)
