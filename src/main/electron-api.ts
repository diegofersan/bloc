import * as nodeModule from 'node:module'

/**
 * Imports estáticos `from 'electron'` no bundle ESM fazem falhar o transpilador
 * Node (cjsPreparseModuleExports) com Electron 33 + Node ~20 neste projeto.
 */
type ElectronMain = typeof import('electron')

export const mainRequire = nodeModule.createRequire(import.meta.url)
const electron = mainRequire('electron') as ElectronMain

export const app = electron.app
export const BrowserWindow = electron.BrowserWindow
export const ipcMain = electron.ipcMain
export const shell = electron.shell
export const globalShortcut = electron.globalShortcut
export const Tray = electron.Tray
export const nativeImage = electron.nativeImage
export const nativeTheme = electron.nativeTheme
export const Menu = electron.Menu
export const safeStorage = electron.safeStorage
export const powerMonitor = electron.powerMonitor
export const dialog = electron.dialog
export const protocol = electron.protocol
export const net = electron.net
