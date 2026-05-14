import { ipcMain, app } from '../electron-api'
import {
  startPacServer,
  stopPacServer,
  enableBlocking,
  disableBlocking,
  isBlockingActive,
  cleanupBlocking
} from '../services/siteBlocker'

export function registerSiteBlockerHandlers(): void {
  startPacServer()
  cleanupBlocking()

  ipcMain.handle('site-blocker:enable', (_event, sites: string[]) => {
    return enableBlocking(sites)
  })

  ipcMain.handle('site-blocker:disable', () => {
    return disableBlocking()
  })

  ipcMain.handle('site-blocker:is-active', () => {
    return isBlockingActive()
  })

  ipcMain.handle('site-blocker:cleanup', () => {
    cleanupBlocking()
  })

  app.on('will-quit', () => {
    disableBlocking()
    stopPacServer()
  })
}
