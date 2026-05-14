import { app, BrowserWindow, shell, globalShortcut, Tray, nativeImage, ipcMain, nativeTheme, Menu } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'fs'
import { spawn } from 'child_process'
import { tmpdir } from 'os'
import { is } from '@electron-toolkit/utils'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { registerSyncHandlers } from './ipc/syncHandlers'
import { registerSiteBlockerHandlers } from './ipc/siteBlockerHandlers'
import { registerGoogleCalendarHandlers } from './ipc/googleCalendarHandlers'
import { registerFileMusicHandlers } from './ipc/fileMusicHandlers'
import { startIdleMonitor } from './ipc/idleHandlers'

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null
  let tray: Tray | null = null

  // ── Window preferences (persisted) ──────────────────────────────────
  interface WindowPrefs {
    alwaysOnTop: boolean
  }

  const WINDOW_PREFS_FILE = 'window-prefs.json'

  function getWindowPrefsPath(): string {
    return join(app.getPath('userData'), WINDOW_PREFS_FILE)
  }

  function loadWindowPrefs(): WindowPrefs {
    const path = getWindowPrefsPath()
    if (!existsSync(path)) return { alwaysOnTop: false }
    try {
      return JSON.parse(readFileSync(path, 'utf-8'))
    } catch {
      return { alwaysOnTop: false }
    }
  }

  function saveWindowPrefs(prefs: WindowPrefs): void {
    writeFileSync(getWindowPrefsPath(), JSON.stringify(prefs, null, 2))
  }

  let windowPrefs: WindowPrefs = { alwaysOnTop: false }

  function applyAlwaysOnTop(win: BrowserWindow, enabled: boolean): void {
    win.setAlwaysOnTop(enabled)
    win.setVisibleOnAllWorkspaces(enabled, { visibleOnFullScreen: true })
  }

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
      alwaysOnTop: windowPrefs.alwaysOnTop,
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    if (windowPrefs.alwaysOnTop) {
      applyAlwaysOnTop(mainWindow, true)
    }

    mainWindow.on('ready-to-show', () => {
      mainWindow!.show()
      if (is.dev) {
        mainWindow!.webContents.openDevTools({ mode: 'detach' })
      }
    })

    mainWindow.on('closed', () => {
      mainWindow = null
    })

    mainWindow.on('focus', () => {
      if (process.platform === 'win32') mainWindow?.flashFrame(false)
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
    registerFileMusicHandlers()

    windowPrefs = loadWindowPrefs()

    // Application menu
    const menuTemplate: Electron.MenuItemConstructorOptions[] = [
      ...(process.platform === 'darwin' ? [{
        label: app.name,
        submenu: [
          { role: 'about' as const },
          { type: 'separator' as const },
          { role: 'hide' as const },
          { role: 'hideOthers' as const },
          { role: 'unhide' as const },
          { type: 'separator' as const },
          { role: 'quit' as const }
        ]
      }] : []),
      {
        label: 'Editar',
        submenu: [
          { role: 'undo' as const },
          { role: 'redo' as const },
          { type: 'separator' as const },
          { role: 'cut' as const },
          { role: 'copy' as const },
          { role: 'paste' as const },
          { role: 'selectAll' as const }
        ]
      },
      {
        label: 'Ver',
        submenu: [
          { role: 'reload' as const },
          { role: 'toggleDevTools' as const },
          { type: 'separator' as const },
          {
            label: 'Sobrepor outras janelas',
            type: 'checkbox' as const,
            checked: windowPrefs.alwaysOnTop,
            accelerator: 'CommandOrControl+Alt+T',
            click: (item) => {
              windowPrefs = { ...windowPrefs, alwaysOnTop: item.checked }
              if (mainWindow) applyAlwaysOnTop(mainWindow, item.checked)
              saveWindowPrefs(windowPrefs)
            }
          }
        ]
      },
      {
        label: 'Janela',
        submenu: [
          { role: 'minimize' as const },
          { role: 'close' as const },
          ...(process.platform === 'darwin' ? [
            { type: 'separator' as const },
            { role: 'front' as const }
          ] : [])
        ]
      }
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))

    createWindow()
    startIdleMonitor()

    tray = new Tray(createTrayIcon())
    tray.setTitle('')

    ipcMain.on('get-app-version', (event) => {
      event.returnValue = app.getVersion()
    })

    ipcMain.on('pomodoro-tray-update', (_event, data: { time: string | null; status: string | null }) => {
      if (!tray) return
      tray.setTitle(data.time ?? '')
    })

    ipcMain.on('focus-window', () => {
      if (!mainWindow) return
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    })

    ipcMain.on('alert-attention', () => {
      if (!mainWindow || mainWindow.isFocused()) return
      if (process.platform === 'darwin') {
        app.dock?.bounce('critical')
      } else if (process.platform === 'win32') {
        mainWindow.flashFrame(true)
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
