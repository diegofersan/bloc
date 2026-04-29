import { addDays, format, getISOWeek, getISOWeekYear, parseISO, startOfISOWeek } from 'date-fns'

/** ISO week id like "2026-W17". Week starts on Monday. */
export function getISOWeekId(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  const year = getISOWeekYear(d)
  const week = getISOWeek(d)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** Monday of the ISO week, formatted YYYY-MM-DD. */
export function getWeekStartFromId(id: string): string {
  const m = id.match(/^(\d{4})-W(\d{1,2})$/)
  if (!m) throw new Error(`Invalid week id: ${id}`)
  const year = parseInt(m[1], 10)
  const week = parseInt(m[2], 10)
  // ISO weeks: week 1 contains Jan 4. Construct from Jan 4 + offset.
  const jan4 = new Date(year, 0, 4)
  const monday = startOfISOWeek(jan4)
  const target = addDays(monday, (week - 1) * 7)
  return format(target, 'yyyy-MM-dd')
}

/** Sunday of the ISO week, formatted YYYY-MM-DD. */
export function getWeekEndFromId(id: string): string {
  const start = getWeekStartFromId(id)
  return format(addDays(parseISO(start), 6), 'yyyy-MM-dd')
}

/** Convert a YYYY-MM-DD weekStart (Monday) to its weekEnd (Sunday). */
export function getWeekEndFromStart(weekStart: string): string {
  return format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd')
}

/** Convert YYYY-MM-DD (any day) to that week's Monday. */
export function getWeekStartFromDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(startOfISOWeek(d), 'yyyy-MM-dd')
}
