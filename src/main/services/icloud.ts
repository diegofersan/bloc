import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { is } from '@electron-toolkit/utils'

const ICLOUD_FOLDER = is.dev ? 'Bloc-Dev' : 'Bloc'
const ICLOUD_BASE = join(
  homedir(),
  'Library/Mobile Documents/com~apple~CloudDocs',
  ICLOUD_FOLDER
)

export function checkICloudAvailability(): { available: boolean; path: string } {
  const icloudRoot = join(homedir(), 'Library/Mobile Documents/com~apple~CloudDocs')
  const available = existsSync(icloudRoot)
  return { available, path: ICLOUD_BASE }
}

export function getFilePath(date: string): string {
  const year = date.slice(0, 4)
  return join(ICLOUD_BASE, year, `${date}.md`)
}

export function ensureDir(date: string): void {
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

export function getFileMtime(date: string): number | null {
  const path = getFilePath(date)
  if (!existsSync(path)) return null
  return statSync(path).mtimeMs
}
