import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('bloc', {
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
      }
    })
  } catch (error) {
    console.error(error)
  }
}
