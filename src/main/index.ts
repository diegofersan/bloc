import { app, BrowserWindow, shell, globalShortcut, Tray, nativeImage, ipcMain, nativeTheme, screen } from 'electron'
import { join } from 'path'
import { existsSync, writeFileSync, chmodSync } from 'fs'
import { spawn } from 'child_process'
import { tmpdir } from 'os'
import { is } from '@electron-toolkit/utils'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { registerSyncHandlers } from './ipc/syncHandlers'
import { registerSiteBlockerHandlers } from './ipc/siteBlockerHandlers'
import { registerGoogleCalendarHandlers } from './ipc/googleCalendarHandlers'

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null
  let tray: Tray | null = null
  let savedBounds: Electron.Rectangle | null = null
  let isStealthy = false

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

  function installMacUpdate(zipPath: string): void {
    const appPath = app.getPath('exe').replace(/\/Contents\/MacOS\/.*$/, '')
    const appName = 'Bloc'
    const pid = process.pid

    const script = `#!/bin/bash
# Wait for the app to quit
while kill -0 ${pid} 2>/dev/null; do sleep 0.5; done
sleep 1

TEMP_DIR=$(mktemp -d)
unzip -o "${zipPath}" -d "$TEMP_DIR"

# Find the .app in extracted dir
NEW_APP=$(find "$TEMP_DIR" -name "*.app" -maxdepth 1 -type d | head -1)

if [ -z "$NEW_APP" ]; then
  rm -rf "$TEMP_DIR"
  exit 1
fi

# Swap the app
rm -rf "${appPath}"
mv "$NEW_APP" "${appPath}"

# Ad-hoc re-sign
codesign --force --deep --sign - "${appPath}"

# Remove quarantine
xattr -dr com.apple.quarantine "${appPath}"

# Relaunch
open "${appPath}"

# Cleanup
rm -rf "$TEMP_DIR"
`

    const scriptPath = join(tmpdir(), `${appName}-update.sh`)
    writeFileSync(scriptPath, script, 'utf-8')
    chmodSync(scriptPath, 0o755)

    const child = spawn('/bin/bash', [scriptPath], {
      detached: true,
      stdio: 'ignore'
    })
    child.unref()

    app.quit()
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
    registerSyncHandlers()
    registerSiteBlockerHandlers()
    registerGoogleCalendarHandlers()
    createWindow()

    tray = new Tray(createTrayIcon())
    tray.setTitle('')

    ipcMain.on('get-app-version', (event) => {
      event.returnValue = app.getVersion()
    })

    ipcMain.on('pomodoro-tray-update', (_event, data: { time: string | null; status: string | null }) => {
      if (!tray) return
      tray.setTitle(data.time ?? '')
    })

    // Animate opacity from current to target over duration (ms)
    function animateOpacity(win: BrowserWindow, from: number, to: number, duration: number): void {
      const steps = 12
      const stepMs = duration / steps
      const delta = (to - from) / steps
      let step = 0
      const timer = setInterval(() => {
        step++
        if (step >= steps) {
          win.setOpacity(to)
          clearInterval(timer)
        } else {
          // ease-out quad: decelerating curve
          const t = step / steps
          const eased = t * (2 - t)
          win.setOpacity(from + (to - from) * eased)
        }
      }, stepMs)
    }

    // Stealthy mode IPC handlers
    ipcMain.handle('stealthy:enter', (_event, opts: { width: number; height: number }) => {
      if (!mainWindow || isStealthy) return
      savedBounds = mainWindow.getBounds()
      isStealthy = true

      const display = screen.getDisplayMatching(savedBounds)
      const { width: screenW, height: screenH } = display.workArea
      const x = display.workArea.x + screenW - opts.width - 16
      const y = display.workArea.y + screenH - opts.height - 16

      // Fade out, then transform, then fade in at target opacity
      animateOpacity(mainWindow, 1, 0.4, 150)
      setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        mainWindow.setMinimumSize(200, 80)
        mainWindow.setBackgroundColor('#00000000')
        if (process.platform === 'darwin') {
          mainWindow.setWindowButtonVisibility(false)
        }
        mainWindow.setBounds({ x, y, width: opts.width, height: opts.height }, true)
        mainWindow.setAlwaysOnTop(true, 'floating')
        mainWindow.setContentProtection(true)
        mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
        mainWindow.webContents.send('stealthy:changed', true)
        // Fade in to stealthy opacity
        setTimeout(() => {
          if (!mainWindow || mainWindow.isDestroyed()) return
          animateOpacity(mainWindow, 0.4, 0.92, 200)
        }, 100)
      }, 150)
    })

    ipcMain.handle('stealthy:exit', () => {
      if (!mainWindow || !isStealthy) return
      isStealthy = false

      const bgColor = nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#f8f7f4'

      // Fade out stealthy, then restore, then fade in
      animateOpacity(mainWindow, 0.92, 0.4, 150)
      setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        mainWindow.setAlwaysOnTop(false)
        mainWindow.setContentProtection(false)
        mainWindow.setVisibleOnAllWorkspaces(false)
        mainWindow.setBackgroundColor(bgColor)
        if (process.platform === 'darwin') {
          mainWindow.setWindowButtonVisibility(true)
        }
        mainWindow.setResizable(true)
        mainWindow.setMinimumSize(420, 600)
        if (savedBounds) {
          mainWindow.setBounds(savedBounds, true)
          savedBounds = null
        }
        mainWindow.webContents.send('stealthy:changed', false)
        // Fade back to full opacity
        setTimeout(() => {
          if (!mainWindow || mainWindow.isDestroyed()) return
          animateOpacity(mainWindow, 0.4, 1, 200)
        }, 100)
      }, 150)
    })

    ipcMain.handle('stealthy:resize', (_event, opts: { width: number; height: number; resizable?: boolean }) => {
      if (!mainWindow || !isStealthy) return
      const bounds = mainWindow.getBounds()
      // Anchor to bottom-right: adjust x/y so the bottom-right corner stays fixed
      const newX = bounds.x + bounds.width - opts.width
      const newY = bounds.y + bounds.height - opts.height
      mainWindow.setResizable(opts.resizable !== false)
      mainWindow.setBounds({ x: newX, y: newY, width: opts.width, height: opts.height }, true)
    })

    globalShortcut.register('CommandOrControl+Shift+H', () => {
      if (!mainWindow) return
      if (isStealthy) {
        mainWindow.webContents.send('stealthy:toggle')
      } else {
        mainWindow.show()
        mainWindow.focus()
        mainWindow.webContents.send('stealthy:toggle')
      }
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

    // Auto-update (production only)
    if (!is.dev) {
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = false
      let downloadedZipPath: string | null = null

      autoUpdater.on('update-available', (info) => {
        mainWindow?.webContents.send('update-available', info.version)
      })
      autoUpdater.on('update-downloaded', (info) => {
        downloadedZipPath = info.downloadedFile
        mainWindow?.webContents.send('update-downloaded', info.version)
      })
      autoUpdater.checkForUpdatesAndNotify()

      ipcMain.on('install-update', () => {
        if (process.platform === 'darwin' && downloadedZipPath) {
          installMacUpdate(downloadedZipPath)
        } else {
          autoUpdater.quitAndInstall()
        }
      })
    }

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
