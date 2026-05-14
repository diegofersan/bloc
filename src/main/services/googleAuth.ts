/// <reference types="electron-vite/node" />
import { BrowserWindow, safeStorage, app } from '../electron-api'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createServer, type Server } from 'http'
import { URL } from 'url'

const REDIRECT_PORT = 18923
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth/callback`
const TOKEN_FILE = 'google-tokens.enc'
const SCOPES = ['https://www.googleapis.com/auth/calendar']

interface TokenData {
  access_token: string
  refresh_token: string
  expires_at: number
  token_type: string
}

function getTokenPath(): string {
  return join(app.getPath('userData'), TOKEN_FILE)
}

function getClientCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID
  const clientSecret = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

export function saveTokens(tokens: TokenData): void {
  const json = JSON.stringify(tokens)
  const encrypted = safeStorage.encryptString(json)
  writeFileSync(getTokenPath(), encrypted)
}

export function loadTokens(): TokenData | null {
  const path = getTokenPath()
  if (!existsSync(path)) return null
  try {
    const encrypted = readFileSync(path)
    const json = safeStorage.decryptString(encrypted)
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function clearTokens(): void {
  const path = getTokenPath()
  if (existsSync(path)) {
    const { unlinkSync } = require('fs')
    unlinkSync(path)
  }
}

export function isAuthenticated(): boolean {
  return loadTokens() !== null
}

async function exchangeCodeForTokens(code: string): Promise<TokenData> {
  const creds = getClientCredentials()
  if (!creds) throw new Error('Google OAuth credentials not configured')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    })
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token exchange failed: ${err}`)
  }

  const data = await res.json()
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    token_type: data.token_type
  }
}

async function refreshAccessToken(refreshToken: string): Promise<TokenData> {
  const creds = getClientCredentials()
  if (!creds) throw new Error('Google OAuth credentials not configured')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: 'refresh_token'
    })
  })

  if (!res.ok) {
    const err = await res.text()
    // If refresh token was revoked or is invalid, clear stored tokens
    // to prevent infinite retry loops
    if (res.status === 400 || res.status === 401) {
      console.warn('[google-auth] Refresh token revoked or invalid — clearing stored tokens')
      clearTokens()
    }
    throw new Error(`Token refresh failed (${res.status}): ${err}`)
  }

  const data = await res.json()
  return {
    access_token: data.access_token,
    refresh_token: refreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
    token_type: data.token_type
  }
}

export async function getValidAccessToken(): Promise<string> {
  const tokens = loadTokens()
  if (!tokens) throw new Error('Not authenticated with Google')

  // Refresh if expiring within 5 minutes
  if (Date.now() > tokens.expires_at - 5 * 60 * 1000) {
    const refreshed = await refreshAccessToken(tokens.refresh_token)
    saveTokens(refreshed)
    return refreshed.access_token
  }

  return tokens.access_token
}

export function startOAuthFlow(): Promise<TokenData> {
  const creds = getClientCredentials()
  if (!creds) return Promise.reject(new Error('Google OAuth credentials not configured'))

  return new Promise((resolve, reject) => {
    let server: Server | null = null
    let authWindow: BrowserWindow | null = null

    function cleanup() {
      server?.close()
      server = null
      if (authWindow && !authWindow.isDestroyed()) {
        authWindow.close()
      }
      authWindow = null
    }

    server = createServer(async (req, res) => {
      if (!req.url?.startsWith('/oauth/callback')) {
        res.writeHead(404)
        res.end()
        return
      }

      const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      if (error || !code) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html><body><h2>Autenticação falhou. Pode fechar esta janela.</h2></body></html>')
        cleanup()
        reject(new Error(error || 'No auth code received'))
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body><h2>Autenticação concluída! Pode fechar esta janela.</h2></body></html>')

      try {
        const tokens = await exchangeCodeForTokens(code)
        saveTokens(tokens)
        cleanup()
        resolve(tokens)
      } catch (err) {
        cleanup()
        reject(err)
      }
    })

    server.listen(REDIRECT_PORT, () => {
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id', creds.clientId)
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', SCOPES.join(' '))
      authUrl.searchParams.set('access_type', 'offline')
      authUrl.searchParams.set('prompt', 'consent')

      authWindow = new BrowserWindow({
        width: 500,
        height: 700,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      })

      authWindow.loadURL(authUrl.toString())

      authWindow.on('closed', () => {
        authWindow = null
        // If server is still running, user closed window before completing auth
        if (server) {
          cleanup()
          reject(new Error('Auth window closed by user'))
        }
      })
    })

    server.on('error', (err) => {
      cleanup()
      reject(err)
    })
  })
}
