import { getValidAccessToken } from './googleAuth'

const API_BASE = 'https://www.googleapis.com/calendar/v3'

export interface GoogleCalendarEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  status: string
  updated: string
  colorId?: string
  visibility?: string
}

export interface GoogleCalendar {
  id: string
  summary: string
  backgroundColor: string
  primary?: boolean
  accessRole: string
}

interface EventsListResponse {
  items: GoogleCalendarEvent[]
  nextSyncToken?: string
  nextPageToken?: string
}

async function gcalFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getValidAccessToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  })
  return res
}

export async function listCalendars(): Promise<GoogleCalendar[]> {
  const res = await gcalFetch('/users/me/calendarList')
  if (!res.ok) throw new Error(`Failed to list calendars: ${res.status}`)
  const data = await res.json()
  const all: GoogleCalendar[] = data.items || []
  return all.filter((c) => c.accessRole === 'owner' || c.accessRole === 'writer')
}

export async function listEvents(
  calendarId: string,
  opts: {
    timeMin?: string
    timeMax?: string
    syncToken?: string
    pageToken?: string
    singleEvents?: boolean
  } = {}
): Promise<EventsListResponse> {
  const params = new URLSearchParams()
  if (opts.timeMin) params.set('timeMin', opts.timeMin)
  if (opts.timeMax) params.set('timeMax', opts.timeMax)
  if (opts.syncToken) params.set('syncToken', opts.syncToken)
  if (opts.pageToken) params.set('pageToken', opts.pageToken)
  if (opts.singleEvents !== false) params.set('singleEvents', 'true')
  params.set('orderBy', 'startTime')
  params.set('maxResults', '250')

  const res = await gcalFetch(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`)

  // If syncToken is invalid, retry without it
  if (res.status === 410 && opts.syncToken) {
    const { syncToken: _, ...restOpts } = opts
    return listEvents(calendarId, restOpts)
  }

  if (!res.ok) throw new Error(`Failed to list events: ${res.status}`)
  return res.json()
}

export async function createEvent(
  calendarId: string,
  event: {
    summary: string
    start: { dateTime: string; timeZone?: string }
    end: { dateTime: string; timeZone?: string }
    colorId?: string
    visibility?: 'private' | 'public' | 'default' | 'confidential'
  }
): Promise<GoogleCalendarEvent> {
  const res = await gcalFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify(event)
  })
  if (!res.ok) throw new Error(`Failed to create event: ${res.status}`)
  return res.json()
}

export async function updateEvent(
  calendarId: string,
  eventId: string,
  event: {
    summary?: string
    start?: { dateTime: string; timeZone?: string }
    end?: { dateTime: string; timeZone?: string }
    colorId?: string
    visibility?: 'private' | 'public' | 'default' | 'confidential'
  }
): Promise<GoogleCalendarEvent> {
  const res = await gcalFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(event)
    }
  )
  if (!res.ok) throw new Error(`Failed to update event: ${res.status}`)
  return res.json()
}

export async function deleteEvent(calendarId: string, eventId: string): Promise<void> {
  const res = await gcalFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' }
  )
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete event: ${res.status}`)
  }
}
