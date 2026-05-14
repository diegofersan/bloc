import { ipcMain, BrowserWindow } from '../electron-api'
import {
  checkICloudAvailability,
  readDayFile,
  writeDayFile,
  listDayFiles,
  getFileMtime,
  readReviewFile,
  writeReviewFile,
  listReviewFiles,
  readBlocksFile,
  writeBlocksFile,
  getBlocksFileMtime
} from '../services/icloud'
import {
  serialize,
  deserialize,
  serializeReview,
  deserializeReview,
  serializeBlocksFile,
  deserializeBlocksFile
} from '../services/markdownSerializer'
import type { DayFileData, WeeklyReviewData, BlocksFileData } from '../services/markdownSerializer'

let pollingInterval: ReturnType<typeof setInterval> | null = null
let watchedDates: string[] = []
const lastKnownMtimes: Map<string, number> = new Map()
let lastBlocksMtime: number | null = null

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

  if (lastBlocksMtime === null) {
    lastBlocksMtime = getBlocksFileMtime()
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

    const blocksMtime = getBlocksFileMtime()
    if (blocksMtime !== null && blocksMtime !== lastBlocksMtime) {
      lastBlocksMtime = blocksMtime
      const content = readBlocksFile()
      if (content) {
        const data = deserializeBlocksFile(content)
        const windows = BrowserWindow.getAllWindows()
        for (const win of windows) {
          win.webContents.send('icloud:blocks-file-changed', data)
        }
      }
    } else if (blocksMtime === null && lastBlocksMtime !== null) {
      lastBlocksMtime = null
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

  ipcMain.handle('icloud:read-review', (_event, week: string) => {
    const content = readReviewFile(week)
    if (!content) return null
    return deserializeReview(content)
  })

  ipcMain.handle('icloud:write-review', (_event, data: WeeklyReviewData) => {
    const content = serializeReview(data)
    writeReviewFile(data.week, content)
    return true
  })

  ipcMain.handle('icloud:list-reviews', () => {
    return listReviewFiles()
  })

  ipcMain.handle('icloud:read-blocks', () => {
    const content = readBlocksFile()
    if (!content) return null
    return deserializeBlocksFile(content)
  })

  ipcMain.handle('icloud:write-blocks', (_event, data: BlocksFileData) => {
    const content = serializeBlocksFile(data)
    writeBlocksFile(content)
    const mtime = getBlocksFileMtime()
    if (mtime !== null) {
      lastBlocksMtime = mtime
    }
    return true
  })
}
