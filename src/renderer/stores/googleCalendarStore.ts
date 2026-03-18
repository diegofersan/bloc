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
  syncError: string | null
  isSyncing: boolean
  setConnected: (connected: boolean) => void
  setSelectedCalendar: (calendarId: string | null) => void
  setCalendars: (calendars: GoogleCalendarInfo[]) => void
  setSyncToken: (token: string | null) => void
  setLastSyncAt: (time: number | null) => void
  setSyncError: (error: string | null) => void
  setIsSyncing: (syncing: boolean) => void
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
      syncError: null,
      isSyncing: false,

      setConnected: (connected) => set({ isConnected: connected }),

      setSelectedCalendar: (calendarId) => set({ selectedCalendarId: calendarId }),

      setCalendars: (calendars) => set({ calendars }),

      setSyncToken: (token) => set({ syncToken: token }),

      setLastSyncAt: (time) => set({ lastSyncAt: time }),

      setSyncError: (error) => set({ syncError: error }),

      setIsSyncing: (syncing) => set({ isSyncing: syncing }),

      reset: () =>
        set({
          isConnected: false,
          selectedCalendarId: null,
          calendars: [],
          syncToken: null,
          lastSyncAt: null,
          syncError: null,
          isSyncing: false
        })
    }),
    {
      name: 'bloc-google-calendar',
      version: 1,
      partialize: (state) => ({
        isConnected: state.isConnected,
        selectedCalendarId: state.selectedCalendarId,
        calendars: state.calendars,
        syncToken: state.syncToken,
        lastSyncAt: state.lastSyncAt
      })
    }
  )
)
