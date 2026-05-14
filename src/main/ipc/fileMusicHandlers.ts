import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readdir } from 'fs/promises'
import { join, extname } from 'path'
import { pathToFileURL } from 'url'
import { existsSync } from 'fs'

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus'])

export function registerFileMusicHandlers(): void {
  ipcMain.handle('music:pick-folder', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (canceled || filePaths.length === 0) return null as string | null
    return filePaths[0]!
  })

  ipcMain.handle('music:list-audio', async (_event, folderPath: unknown) => {
    if (typeof folderPath !== 'string' || folderPath.trim() === '') return [] as string[]
    if (!existsSync(folderPath)) return [] as string[]
    try {
      const dirents = await readdir(folderPath, { withFileTypes: true })
      const hrefs: string[] = []
      for (const ent of dirents) {
        if (!ent.isFile()) continue
        const ext = extname(ent.name).toLowerCase()
        if (!AUDIO_EXT.has(ext)) continue
        const abs = join(folderPath, ent.name)
        hrefs.push(pathToFileURL(abs).href)
      }
      hrefs.sort((a, b) => decodeURIComponent(a).localeCompare(decodeURIComponent(b)))
      return hrefs
    } catch {
      return [] as string[]
    }
  })
}
