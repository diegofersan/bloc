import { useTimeBlockStore, type TimeBlock, type TimeBlockColor } from '../stores/timeBlockStore'
import { useGoogleCalendarStore } from '../stores/googleCalendarStore'
import { format, parseISO, startOfDay, endOfDay } from 'date-fns'

interface GCalEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  status: string
  updated: string
}

const SYNC_INTERVAL = 5 * 60 * 1000 // 5 minutes
let syncTimer: ReturnType<typeof setInterval> | null = null

// Track last-pushed timestamp per googleEventId to avoid pushing unchanged blocks
const lastPushedAt = new Map<string, number>()

// Track google event IDs pending deletion from GCal
const pendingDeletes = new Set<string>()

// Reactive push state
let reactivePushUnsub: (() => void) | null = null
let reactivePushTimer: ReturnType<typeof setTimeout> | null = null
const pendingReactiveUpdates = new Map<string, { date: string; blockId: string }>()

function dateTimeToMinutes(dateTime: string): number {
  const d = new Date(dateTime)
  return d.getHours() * 60 + d.getMinutes()
}

function minutesToDateTime(date: string, minutes: number): string {
  const d = parseISO(date)
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return d.toISOString()
}

function eventToTimeBlock(event: GCalEvent, date: string): TimeBlock | null {
  // Skip all-day events
  if (!event.start.dateTime || !event.end.dateTime) return null
  if (event.status === 'cancelled') return null

  return {
    id: crypto.randomUUID(),
    date,
    startTime: dateTimeToMinutes(event.start.dateTime),
    endTime: dateTimeToMinutes(event.end.dateTime),
    title: event.summary || 'Sem título',
    color: 'sky' as TimeBlockColor,
    createdAt: Date.now(),
    updatedAt: new Date(event.updated).getTime(),
    googleEventId: event.id,
    isGoogleReadOnly: false
  }
}

async function pushLocalBlocksToGcal(date: string, calendarId: string): Promise<void> {
  const blocks = useTimeBlockStore.getState().blocks[date] || []
  const localOnly = blocks.filter((b) => !b.googleEventId)

  for (const block of localOnly) {
    try {
      const result = await window.bloc?.gcal.createEvent(calendarId, {
        summary: block.title,
        start: { dateTime: minutesToDateTime(date, block.startTime) },
        end: { dateTime: minutesToDateTime(date, block.endTime) }
      })

      if (result?.success && result.event) {
        const event = result.event as GCalEvent
        // Update the block with the Google Event ID
        const currentBlocks = useTimeBlockStore.getState().blocks[date] || []
        const updated = currentBlocks.map((b) =>
          b.id === block.id ? { ...b, googleEventId: event.id } : b
        )
        useTimeBlockStore.setState({
          blocks: { ...useTimeBlockStore.getState().blocks, [date]: updated }
        })
        // Mark as just pushed so we don't re-push immediately
        lastPushedAt.set(event.id, Date.now())
      }
    } catch (err) {
      console.error('[gcal-sync] Failed to push block to GCal:', err)
    }
  }
}

async function pushUpdatedBlocksToGcal(date: string, calendarId: string): Promise<void> {
  const blocks = useTimeBlockStore.getState().blocks[date] || []
  const withGcal = blocks.filter((b) => b.googleEventId)

  for (const block of withGcal) {
    const gcalId = block.googleEventId!
    const pushed = lastPushedAt.get(gcalId) || 0

    // Only push if the block was updated after it was last pushed
    if (block.updatedAt <= pushed) continue

    try {
      await window.bloc?.gcal.updateEvent(calendarId, gcalId, {
        summary: block.title,
        start: { dateTime: minutesToDateTime(date, block.startTime) },
        end: { dateTime: minutesToDateTime(date, block.endTime) }
      })
      lastPushedAt.set(gcalId, Date.now())
    } catch (err) {
      console.error('[gcal-sync] Failed to update event in GCal:', err)
    }
  }
}

async function processPendingDeletes(calendarId: string): Promise<void> {
  if (pendingDeletes.size === 0) return

  const toDelete = Array.from(pendingDeletes)
  pendingDeletes.clear()

  for (const googleEventId of toDelete) {
    try {
      await window.bloc?.gcal.deleteEvent(calendarId, googleEventId)
      lastPushedAt.delete(googleEventId)
    } catch (err) {
      console.error('[gcal-sync] Failed to delete event from GCal:', err)
    }
  }
}

async function pullEventsFromGcal(date: string, calendarId: string): Promise<void> {
  const timeMin = startOfDay(parseISO(date)).toISOString()
  const timeMax = endOfDay(parseISO(date)).toISOString()

  try {
    console.log('[gcal-sync] Pulling events for', date, '| timeMin:', timeMin, '| timeMax:', timeMax)
    const result = await window.bloc?.gcal.listEvents(calendarId, {
      timeMin,
      timeMax
    })

    if (!result?.success) {
      console.error('[gcal-sync] listEvents failed:', result)
      return
    }

    const events = (result.items || []) as GCalEvent[]
    console.log('[gcal-sync] Got', events.length, 'events from GCal')
    const currentBlocks = useTimeBlockStore.getState().blocks[date] || []

    // Build a map of existing blocks by googleEventId
    const blocksByGcalId = new Map<string, TimeBlock>()
    for (const b of currentBlocks) {
      if (b.googleEventId) blocksByGcalId.set(b.googleEventId, b)
    }

    let updatedBlocks = [...currentBlocks]

    let added = 0
    let updated = 0
    let skippedAllDay = 0

    for (const event of events) {
      if (!event.start.dateTime || !event.end.dateTime) {
        skippedAllDay++
        continue
      }

      const existing = blocksByGcalId.get(event.id)

      if (event.status === 'cancelled') {
        // Remove cancelled events
        if (existing) {
          updatedBlocks = updatedBlocks.filter((b) => b.googleEventId !== event.id)
        }
        continue
      }

      const eventUpdatedAt = new Date(event.updated).getTime()

      if (existing) {
        // Update if GCal version is newer (last-write-wins)
        if (eventUpdatedAt > existing.updatedAt) {
          updatedBlocks = updatedBlocks.map((b) =>
            b.googleEventId === event.id
              ? {
                  ...b,
                  startTime: dateTimeToMinutes(event.start.dateTime!),
                  endTime: dateTimeToMinutes(event.end.dateTime!),
                  title: event.summary || b.title,
                  updatedAt: eventUpdatedAt
                }
              : b
          )
          // Mark as synced so reactive push doesn't push it back
          lastPushedAt.set(event.id, eventUpdatedAt)
          updated++
        }
      } else {
        // New event from GCal
        const newBlock = eventToTimeBlock(event, date)
        if (newBlock) {
          updatedBlocks.push(newBlock)
          // Mark as synced so reactive push doesn't push it back
          lastPushedAt.set(event.id, newBlock.updatedAt)
          added++
        }
      }
    }

    console.log('[gcal-sync] Pull result: added', added, '| updated', updated, '| skipped all-day', skippedAllDay, '| total blocks', updatedBlocks.length)
    useTimeBlockStore.getState().setBlocksForDate(date, updatedBlocks)
  } catch (err) {
    console.error('[gcal-sync] Failed to pull events from GCal:', err)
  }
}

export async function syncDate(date: string): Promise<void> {
  const { isConnected, selectedCalendarId } = useGoogleCalendarStore.getState()
  if (!isConnected || !selectedCalendarId) {
    console.log('[gcal-sync] Skipping sync — not connected or no calendar selected')
    return
  }

  console.log('[gcal-sync] syncDate started for', date, 'calendar:', selectedCalendarId)

  // Process pending deletes first
  await processPendingDeletes(selectedCalendarId)

  // Pull remote changes
  await pullEventsFromGcal(date, selectedCalendarId)

  // Push local-only blocks
  await pushLocalBlocksToGcal(date, selectedCalendarId)

  // Push updated local blocks
  await pushUpdatedBlocksToGcal(date, selectedCalendarId)

  useGoogleCalendarStore.getState().setLastSyncAt(Date.now())
  console.log('[gcal-sync] syncDate completed for', date)
}

export async function syncAllVisibleDates(): Promise<void> {
  const { isConnected, selectedCalendarId } = useGoogleCalendarStore.getState()
  if (!isConnected || !selectedCalendarId) return

  // Sync dates that have blocks
  const datesWithBlocks = useTimeBlockStore.getState().getDatesWithBlocks()
  const today = format(new Date(), 'yyyy-MM-dd')
  const datesToSync = Array.from(new Set([today, ...datesWithBlocks]))

  for (const date of datesToSync) {
    await syncDate(date)
  }
}

function setupReactivePush(): void {
  // Clean up existing subscription
  if (reactivePushUnsub) {
    reactivePushUnsub()
    reactivePushUnsub = null
  }

  let previousBlocks = useTimeBlockStore.getState().blocks

  reactivePushUnsub = useTimeBlockStore.subscribe((state) => {
    const currentBlocks = state.blocks
    if (currentBlocks === previousBlocks) return

    const { isConnected, selectedCalendarId } = useGoogleCalendarStore.getState()
    if (!isConnected || !selectedCalendarId) {
      previousBlocks = currentBlocks
      return
    }

    // Check all dates for changes
    const allDates = Array.from(new Set([...Object.keys(previousBlocks), ...Object.keys(currentBlocks)]))

    for (const date of allDates) {
      const prev = previousBlocks[date] || []
      const curr = currentBlocks[date] || []

      // Detect deleted blocks with googleEventId
      const currGcalIds = new Set(
        curr.filter((b) => b.googleEventId).map((b) => b.googleEventId!)
      )
      for (const block of prev) {
        if (block.googleEventId && !currGcalIds.has(block.googleEventId)) {
          pendingDeletes.add(block.googleEventId)
        }
      }

      // Detect updated blocks with googleEventId
      for (const block of curr) {
        if (block.googleEventId) {
          const prevBlock = prev.find((b) => b.id === block.id)
          if (prevBlock && block.updatedAt > prevBlock.updatedAt) {
            // Only queue if not already synced (avoids pull-then-push-back loop)
            const pushed = lastPushedAt.get(block.googleEventId) || 0
            if (block.updatedAt > pushed) {
              pendingReactiveUpdates.set(block.googleEventId, { date, blockId: block.id })
            }
          }
        }
      }
    }

    previousBlocks = currentBlocks

    // Debounce: schedule push after 2 seconds
    if (pendingReactiveUpdates.size > 0 || pendingDeletes.size > 0) {
      if (reactivePushTimer) clearTimeout(reactivePushTimer)
      reactivePushTimer = setTimeout(async () => {
        const { isConnected: connected, selectedCalendarId: calId } =
          useGoogleCalendarStore.getState()
        if (!connected || !calId) return

        // Process deletes
        await processPendingDeletes(calId)

        // Process updates
        const updates = Array.from(pendingReactiveUpdates.entries())
        pendingReactiveUpdates.clear()

        for (const [googleEventId, { date, blockId }] of updates) {
          const blocks = useTimeBlockStore.getState().blocks[date] || []
          const block = blocks.find((b) => b.id === blockId)
          if (!block) continue

          try {
            await window.bloc?.gcal.updateEvent(calId, googleEventId, {
              summary: block.title,
              start: { dateTime: minutesToDateTime(date, block.startTime) },
              end: { dateTime: minutesToDateTime(date, block.endTime) }
            })
            lastPushedAt.set(googleEventId, Date.now())
          } catch (err) {
            console.error('[gcal-sync] Reactive push failed:', err)
          }
        }
      }, 2000)
    }
  })
}

export function startPeriodicSync(): void {
  stopPeriodicSync()

  // Setup reactive push for immediate updates
  setupReactivePush()

  // Initial sync
  syncAllVisibleDates().catch((err) =>
    console.error('[gcal-sync] Initial sync failed:', err)
  )

  syncTimer = setInterval(() => {
    syncAllVisibleDates().catch((err) =>
      console.error('[gcal-sync] Periodic sync failed:', err)
    )
  }, SYNC_INTERVAL)
}

export function stopPeriodicSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }
  if (reactivePushUnsub) {
    reactivePushUnsub()
    reactivePushUnsub = null
  }
  if (reactivePushTimer) {
    clearTimeout(reactivePushTimer)
    reactivePushTimer = null
  }
}
