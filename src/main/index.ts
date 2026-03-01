import { app, BrowserWindow, shell, globalShortcut, Tray, nativeImage, ipcMain, nativeTheme } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null
  let tray: Tray | null = null

  function getIconPath(): string | undefined {
    // In production, icons are in the build resources bundled by electron-builder
    // In dev, they're in the project build/ folder
    const candidates = [
      join(__dirname, '../../build/icon.icns'),
      join(__dirname, '../../build/icon.png'),
      join(app.getAppPath(), 'build/icon.icns'),
      join(app.getAppPath(), 'build/icon.png')
    ]
    return candidates.find((p) => existsSync(p))
  }

  function createTrayIcon(): Electron.NativeImage {
    // Try to load the real tray template images from build/
    const candidates = [
      join(__dirname, '../../build/trayTemplate.png'),
      join(app.getAppPath(), 'build/trayTemplate.png')
    ]
    const trayPath = candidates.find((p) => existsSync(p))
    if (trayPath) {
      const img = nativeImage.createFromPath(trayPath)
      img.setTemplateImage(true)
      return img
    }

    // Fallback: inline SVG template icon
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <rect x="2" y="2" width="12" height="12" rx="3" ry="3" fill="black" />
      <rect x="5" y="5" width="6" height="2" rx="0.5" fill="white" />
      <rect x="5" y="9" width="4" height="2" rx="0.5" fill="white" />
    </svg>`
    const img = nativeImage.createFromBuffer(Buffer.from(svg))
    img.setTemplateImage(true)
    return img
  }

  function createWindow(): void {
    if (mainWindow && !mainWindow.isDestroyed()) return

    const bgColor = nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#f8f7f4'
    const iconPath = getIconPath()

    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 420,
      minHeight: 600,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
      vibrancy: 'under-window',
      visualEffectState: 'active',
      backgroundColor: bgColor,
      icon: iconPath,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    mainWindow.on('ready-to-show', () => {
      mainWindow!.show()
      if (is.dev) {
        mainWindow!.webContents.openDevTools({ mode: 'detach' })
      }
    })

    mainWindow.on('closed', () => {
      mainWindow = null
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    createWindow()

    tray = new Tray(createTrayIcon())
    tray.setTitle('')

    ipcMain.on('pomodoro-tray-update', (_event, data: { time: string | null; status: string | null }) => {
      if (!tray) return
      tray.setTitle(data.time ?? '')
    })

    globalShortcut.register('CommandOrControl+,', () => {
      mainWindow?.webContents.send('navigate', '/settings')
    })

    globalShortcut.register('CommandOrControl+Shift+D', () => {
      mainWindow?.webContents.send('quick-capture')
      mainWindow?.show()
      mainWindow?.focus()
    })

    globalShortcut.register('CommandOrControl+I', () => {
      mainWindow?.webContents.send('navigate', '/inbox')
      mainWindow?.show()
      mainWindow?.focus()
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    if (tray) {
      tray.destroy()
      tray = null
    }
  })
}
