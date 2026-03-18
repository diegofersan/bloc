import { ipcMain, BrowserWindow } from 'electron'
import {
  checkICloudAvailability,
  readDayFile,
  writeDayFile,
  listDayFiles,
  getFileMtime
} from '../services/icloud'
import { serialize, deserialize } from '../services/markdownSerializer'
import type { DayFileData } from '../services/markdownSerializer'

let pollingInterval: ReturnType<typeof setInterval> | null = null
let watchedDates: string[] = []
const lastKnownMtimes: Map<string, number> = new Map()

function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
}

function startPolling(): void {
  // Stop existing interval but keep watchedDates and mtimes
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }

  pollingInterval = setInterval(() => {
    for (const date of watchedDates) {
      const mtime = getFileMtime(date)
      const lastMtime = lastKnownMtimes.get(date)

      if (mtime !== null && mtime !== lastMtime) {
        lastKnownMtimes.set(date, mtime)
        const content = readDayFile(date)
        if (content) {
          const data = deserialize(content)
          const windows = BrowserWindow.getAllWindows()
          for (const win of windows) {
            win.webContents.send('icloud:file-changed', data)
          }
        }
      } else if (mtime === null && lastMtime !== undefined) {
        // File was deleted externally
        lastKnownMtimes.delete(date)
      }
    }
  }, 3000)
}

export function registerSyncHandlers(): void {
  ipcMain.handle('icloud:check-availability', () => {
    return checkICloudAvailability()
  })

  ipcMain.handle('icloud:read-day', (_event, date: string) => {
    const content = readDayFile(date)
    if (!content) return null
    return deserialize(content)
  })

  ipcMain.handle('icloud:write-day', (_event, data: DayFileData) => {
    const content = serialize(data)
    writeDayFile(data.date, content)
    // Update known mtime so polling doesn't pick up our own write
    const mtime = getFileMtime(data.date)
    if (mtime !== null) {
      lastKnownMtimes.set(data.date, mtime)
    }
    return true
  })

  ipcMain.handle('icloud:read-all-days', () => {
    const dates = listDayFiles()
    const results: DayFileData[] = []
    for (const date of dates) {
      const content = readDayFile(date)
      if (content) {
        results.push(deserialize(content))
      }
    }
    return results
  })

  ipcMain.handle('icloud:list-days', () => {
    return listDayFiles()
  })

  ipcMain.handle('icloud:watch-dates', (_event, dates: string[]) => {
    watchedDates = dates
    // Snapshot current mtimes before starting
    lastKnownMtimes.clear()
    for (const date of watchedDates) {
      const mtime = getFileMtime(date)
      if (mtime !== null) {
        lastKnownMtimes.set(date, mtime)
      }
    }
    startPolling()
    return true
  })

  ipcMain.handle('icloud:stop-watching', () => {
    stopPolling()
    watchedDates = []
    lastKnownMtimes.clear()
    return true
  })
}
