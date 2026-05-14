import { ipcMain, dialog, BrowserWindow, protocol, net } from '../electron-api'
import { randomUUID } from 'node:crypto'
import { readdir } from 'fs/promises'
import { join, extname, resolve, sep } from 'path'
import { existsSync, statSync } from 'fs'
import { pathToFileURL } from 'url'

export const FLOW_AUDIO_SCHEME = 'bloc-flow-audio'

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus'])

/** Tokens opacos: o renderer (http) não pode usar file:// nos <audio>; resolvemos só no main. */
const pathByToken = new Map<string, string>()
const tokenByPath = new Map<string, string>()

function isPathInsideDir(dir: string, filePath: string): boolean {
  const root = resolve(dir)
  const file = resolve(filePath)
  if (file === root) return false
  const prefix = root.endsWith(sep) ? root : root + sep
  return file.startsWith(prefix)
}

export function registerFlowAudioSchemePrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: FLOW_AUDIO_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true
      }
    }
  ])
}

export function registerFlowAudioProtocol(): void {
  protocol.handle(FLOW_AUDIO_SCHEME, (request) => {
    try {
      const url = new URL(request.url)
      const tokenRaw = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      if (!tokenRaw) return Promise.resolve(new Response(null, { status: 404 }))
      const abs = pathByToken.get(tokenRaw)
      if (!abs || !existsSync(abs)) return Promise.resolve(new Response(null, { status: 404 }))
      try {
        if (!statSync(abs).isFile()) return Promise.resolve(new Response(null, { status: 404 }))
      } catch {
        return Promise.resolve(new Response(null, { status: 404 }))
      }
      return net.fetch(pathToFileURL(abs).href)
    } catch {
      return Promise.resolve(new Response(null, { status: 500 }))
    }
  })
}

/** Remove tokens de ficheiros que já não estão dentro da pasta de Flow. */
function pruneStaleEntries(folderRoot: string): void {
  for (const [tok, abs] of [...pathByToken.entries()]) {
    if (!existsSync(abs) || !isPathInsideDir(folderRoot, abs)) {
      pathByToken.delete(tok)
      tokenByPath.delete(abs)
    }
  }
}

function opaquePlaybackHref(resolvedAbsolute: string): string {
  const resolved = resolve(resolvedAbsolute)
  let tok = tokenByPath.get(resolved)
  if (!tok) {
    tok = randomUUID()
    tokenByPath.set(resolved, tok)
    pathByToken.set(tok, resolved)
  }
  return `${FLOW_AUDIO_SCHEME}://media/${encodeURIComponent(tok)}`
}

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
    const root = resolve(folderPath.trim())

    try {
      pruneStaleEntries(root)
      const dirents = await readdir(folderPath, { withFileTypes: true })
      const hrefs: string[] = []

      for (const ent of dirents) {
        if (!ent.isFile()) continue
        const ext = extname(ent.name).toLowerCase()
        if (!AUDIO_EXT.has(ext)) continue
        const abs = join(folderPath, ent.name)
        const resolvedAbs = resolve(abs)
        if (!isPathInsideDir(root, resolvedAbs)) continue
        hrefs.push(opaquePlaybackHref(resolvedAbs))
      }

      hrefs.sort((a, b) => decodeURIComponent(a).localeCompare(decodeURIComponent(b)))
      return hrefs
    } catch {
      return [] as string[]
    }
  })
}
