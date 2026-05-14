/**
 * IPC mutations return `{ success: boolean, ... }` instead of rejecting.
 * These helpers throw on failure so callers (e.g. withRetry) see real errors.
 */

type GcalFail = { success: false; error?: string }
type GcalCreateOk = { success: true; event: unknown }
type GcalMutationOk = { success: true; event?: unknown }

function requireGcalBridge(): NonNullable<Window['bloc']>['gcal'] {
  const g = window.bloc?.gcal
  if (!g) throw new Error('Google Calendar indisponível neste ambiente')
  return g
}

export async function gcalCreateEvent(
  calendarId: string,
  eventData: {
    summary: string
    start: { dateTime: string; timeZone?: string }
    end: { dateTime: string; timeZone?: string }
    colorId?: string
    visibility?: 'private' | 'public' | 'default' | 'confidential'
  }
): Promise<{ event: unknown }> {
  const res = (await requireGcalBridge().createEvent(calendarId, eventData)) as GcalCreateOk | GcalFail
  if (!res || res.success !== true) {
    throw new Error((res as GcalFail)?.error ?? 'Falha ao criar evento no Google Calendar')
  }
  if (!res.event) throw new Error('Resposta inválida ao criar evento no Google Calendar')
  return { event: res.event }
}

export async function gcalUpdateEvent(
  calendarId: string,
  eventId: string,
  eventData: {
    summary?: string
    start?: { dateTime: string; timeZone?: string }
    end?: { dateTime: string; timeZone?: string }
    colorId?: string
    visibility?: 'private' | 'public' | 'default' | 'confidential'
  }
): Promise<void> {
  const res = (await requireGcalBridge().updateEvent(calendarId, eventId, eventData)) as GcalMutationOk | GcalFail
  if (!res || res.success !== true) {
    throw new Error((res as GcalFail)?.error ?? 'Falha ao atualizar evento no Google Calendar')
  }
}

export async function gcalDeleteEvent(calendarId: string, eventId: string): Promise<void> {
  const res = (await requireGcalBridge().deleteEvent(calendarId, eventId)) as GcalMutationOk | GcalFail
  if (!res || res.success !== true) {
    throw new Error((res as GcalFail)?.error ?? 'Falha ao eliminar evento no Google Calendar')
  }
}
