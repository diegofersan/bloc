import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('bloc', {
      getAppVersion: (): string => ipcRenderer.sendSync('get-app-version'),
      onNavigate: (callback: (path: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, path: string) => callback(path)
        ipcRenderer.on('navigate', handler)
        return () => {
          ipcRenderer.removeListener('navigate', handler)
        }
      },
      onQuickCapture: (callback: () => void) => {
        const handler = () => callback()
        ipcRenderer.on('quick-capture', handler)
        return () => {
          ipcRenderer.removeListener('quick-capture', handler)
        }
      },
      updatePomodoroTray: (time: string | null, status: string | null) => {
        ipcRenderer.send('pomodoro-tray-update', { time, status })
      },
      focusWindow: () => {
        ipcRenderer.send('focus-window')
      },
      onUpdateAvailable: (callback: (version: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, version: string) => callback(version)
        ipcRenderer.on('update-available', handler)
        return () => { ipcRenderer.removeListener('update-available', handler) }
      },
      onUpdateDownloaded: (callback: (version: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, version: string) => callback(version)
        ipcRenderer.on('update-downloaded', handler)
        return () => { ipcRenderer.removeListener('update-downloaded', handler) }
      },
      installUpdate: () => {
        ipcRenderer.send('install-update')
      },
      icloud: {
        checkAvailability: () => ipcRenderer.invoke('icloud:check-availability'),
        readDay: (date: string) => ipcRenderer.invoke('icloud:read-day', date),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        writeDay: (data: any) => ipcRenderer.invoke('icloud:write-day', data),
        readAllDays: () => ipcRenderer.invoke('icloud:read-all-days'),
        listDays: () => ipcRenderer.invoke('icloud:list-days'),
        watchDates: (dates: string[]) => ipcRenderer.invoke('icloud:watch-dates', dates),
        stopWatching: () => ipcRenderer.invoke('icloud:stop-watching'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onFileChanged: (callback: (data: any) => void) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
          ipcRenderer.on('icloud:file-changed', handler)
          return () => {
            ipcRenderer.removeListener('icloud:file-changed', handler)
          }
        }
      },
      siteBlocker: {
        enable: (sites: string[]) => ipcRenderer.invoke('site-blocker:enable', sites),
        disable: () => ipcRenderer.invoke('site-blocker:disable'),
        isActive: () => ipcRenderer.invoke('site-blocker:is-active'),
        cleanup: () => ipcRenderer.invoke('site-blocker:cleanup')
      },
      stealthy: {
        enter: (opts: { width: number; height: number }) => ipcRenderer.invoke('stealthy:enter', opts),
        exit: () => ipcRenderer.invoke('stealthy:exit'),
        resize: (opts: { width: number; height: number; resizable?: boolean }) => ipcRenderer.invoke('stealthy:resize', opts),
        onToggle: (callback: () => void) => {
          const handler = () => callback()
          ipcRenderer.on('stealthy:toggle', handler)
          return () => ipcRenderer.removeListener('stealthy:toggle', handler)
        },
        onChange: (callback: (active: boolean) => void) => {
          const handler = (_event: Electron.IpcRendererEvent, active: boolean) => callback(active)
          ipcRenderer.on('stealthy:changed', handler)
          return () => ipcRenderer.removeListener('stealthy:changed', handler)
        }
      },
      gcal: {
        startAuth: () => ipcRenderer.invoke('gcal:start-auth'),
        isAuthenticated: () => ipcRenderer.invoke('gcal:is-authenticated'),
        disconnect: () => ipcRenderer.invoke('gcal:disconnect'),
        listCalendars: () => ipcRenderer.invoke('gcal:list-calendars'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        listEvents: (calendarId: string, opts?: any) =>
          ipcRenderer.invoke('gcal:list-events', calendarId, opts),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createEvent: (calendarId: string, eventData: any) =>
          ipcRenderer.invoke('gcal:create-event', calendarId, eventData),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updateEvent: (calendarId: string, eventId: string, eventData: any) =>
          ipcRenderer.invoke('gcal:update-event', calendarId, eventId, eventData),
        deleteEvent: (calendarId: string, eventId: string) =>
          ipcRenderer.invoke('gcal:delete-event', calendarId, eventId)
      }
    })
  } catch (error) {
    console.error(error)
  }
}
