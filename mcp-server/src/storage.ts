/**
 * iCloud storage layer for Bloc day files.
 * Ported from src/main/services/icloud.ts
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { DayFileData, serialize, deserialize } from './markdown.js'

const ICLOUD_FOLDER = process.env.BLOC_DEV === 'true' ? 'Bloc-Dev' : 'Bloc'
const ICLOUD_BASE = process.env.BLOC_DATA_DIR || join(
  homedir(),
  'Library/Mobile Documents/com~apple~CloudDocs',
  ICLOUD_FOLDER
)

export function getBasePath(): string {
  return ICLOUD_BASE
}

export function getFilePath(date: string): string {
  const year = date.slice(0, 4)
  return join(ICLOUD_BASE, year, `${date}.md`)
}

function ensureDir(date: string): void {
  const year = date.slice(0, 4)
  const dir = join(ICLOUD_BASE, year)
  mkdirSync(dir, { recursive: true })
}

export function readDayFile(date: string): string | null {
  const path = getFilePath(date)
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf-8')
}

export function writeDayFile(date: string, content: string): void {
  ensureDir(date)
  writeFileSync(getFilePath(date), content, 'utf-8')
}

export function listDayFiles(): string[] {
  if (!existsSync(ICLOUD_BASE)) return []
  const dates: string[] = []
  const entries = readdirSync(ICLOUD_BASE)
  const years = entries.filter((f) => /^\d{4}$/.test(f))
  for (const year of years) {
    const yearDir = join(ICLOUD_BASE, year)
    if (!statSync(yearDir).isDirectory()) continue
    const files = readdirSync(yearDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    for (const file of files) {
      dates.push(file.replace('.md', ''))
    }
  }
  return dates.sort()
}

export function readDay(date: string): DayFileData | null {
  const content = readDayFile(date)
  if (!content) return null
  return deserialize(content)
}

export function writeDay(data: DayFileData): void {
  data.updatedAt = Date.now()
  const content = serialize(data)
  writeDayFile(data.date, content)
}

export function emptyDay(date: string): DayFileData {
  return {
    date,
    pomodoros: 0,
    updatedAt: Date.now(),
    tasks: [],
    distractions: [],
    timeBlocks: [],
    blockTasks: {}
  }
}

/**
 * Read N consecutive days starting from `weekStartDate` (ISO YYYY-MM-DD).
 * Missing files come back as `null` in the same slot, so callers can rely on
 * positional indexing (Mon..Sun).
 */
export async function readWeek(
  weekStartDate: string,
  days: number = 7
): Promise<{ date: string; data: DayFileData | null }[]> {
  const start = new Date(weekStartDate + 'T00:00:00')
  const dates: string[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    dates.push(iso)
  }
  return Promise.all(
    dates.map(async (date) => ({ date, data: readDay(date) }))
  )
}
