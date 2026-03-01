import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface GoogleCalendarInfo {
  id: string
  summary: string
  backgroundColor: string
  primary?: boolean
}

interface GoogleCalendarState {
  isConnected: boolean
  selectedCalendarId: string | null
  calendars: GoogleCalendarInfo[]
  syncToken: string | null
  lastSyncAt: number | null
  setConnected: (connected: boolean) => void
  setSelectedCalendar: (calendarId: string | null) => void
  setCalendars: (calendars: GoogleCalendarInfo[]) => void
  setSyncToken: (token: string | null) => void
  setLastSyncAt: (time: number | null) => void
  reset: () => void
}

export const useGoogleCalendarStore = create<GoogleCalendarState>()(
  persist(
    (set) => ({
      isConnected: false,
      selectedCalendarId: null,
      calendars: [],
      syncToken: null,
      lastSyncAt: null,

      setConnected: (connected) => set({ isConnected: connected }),

      setSelectedCalendar: (calendarId) => set({ selectedCalendarId: calendarId }),

      setCalendars: (calendars) => set({ calendars }),

      setSyncToken: (token) => set({ syncToken: token }),

      setLastSyncAt: (time) => set({ lastSyncAt: time }),

      reset: () =>
        set({
          isConnected: false,
          selectedCalendarId: null,
          calendars: [],
          syncToken: null,
          lastSyncAt: null
        })
    }),
    {
      name: 'bloc-google-calendar',
      version: 1
    }
  )
)
