import { ipcMain } from '../electron-api'
import { startOAuthFlow, isAuthenticated, clearTokens } from '../services/googleAuth'
import {
  listCalendars,
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent
} from '../services/googleCalendar'

export function registerGoogleCalendarHandlers(): void {
  ipcMain.handle('gcal:start-auth', async () => {
    try {
      await startOAuthFlow()
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('gcal:is-authenticated', () => {
    return isAuthenticated()
  })

  ipcMain.handle('gcal:disconnect', () => {
    clearTokens()
    return { success: true }
  })

  ipcMain.handle('gcal:list-calendars', async () => {
    try {
      const calendars = await listCalendars()
      return { success: true, calendars }
    } catch (err) {
      return { success: false, error: (err as Error).message, calendars: [] }
    }
  })

  ipcMain.handle(
    'gcal:list-events',
    async (
      _event,
      calendarId: string,
      opts?: {
        timeMin?: string
        timeMax?: string
        syncToken?: string
        pageToken?: string
      }
    ) => {
      try {
        const result = await listEvents(calendarId, opts)
        return { success: true, ...result }
      } catch (err) {
        return { success: false, error: (err as Error).message, items: [] }
      }
    }
  )

  ipcMain.handle(
    'gcal:create-event',
    async (
      _event,
      calendarId: string,
      eventData: {
        summary: string
        start: { dateTime: string; timeZone?: string }
        end: { dateTime: string; timeZone?: string }
        colorId?: string
        visibility?: 'private' | 'public' | 'default' | 'confidential'
      }
    ) => {
      try {
        const created = await createEvent(calendarId, eventData)
        return { success: true, event: created }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(
    'gcal:update-event',
    async (
      _event,
      calendarId: string,
      eventId: string,
      eventData: {
        summary?: string
        start?: { dateTime: string; timeZone?: string }
        end?: { dateTime: string; timeZone?: string }
        colorId?: string
        visibility?: 'private' | 'public' | 'default' | 'confidential'
      }
    ) => {
      try {
        const updated = await updateEvent(calendarId, eventId, eventData)
        return { success: true, event: updated }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle('gcal:delete-event', async (_event, calendarId: string, eventId: string) => {
    try {
      await deleteEvent(calendarId, eventId)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
