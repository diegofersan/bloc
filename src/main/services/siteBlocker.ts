import { createServer, Server } from 'http'
import { execSync } from 'child_process'
import { existsSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { app } from '../electron-api'

const PAC_PORT = 7828
const PAC_HOST = '127.0.0.1'
const DEAD_PROXY = 'PROXY 127.0.0.1:9'
const SENTINEL_NAME = '.bloc-blocking-active'

let server: Server | null = null
let pacContent = ''
let blocking = false

function sentinelPath(): string {
  return join(app.getPath('userData'), SENTINEL_NAME)
}

function generatePac(sites: string[]): string {
  const exceptions: string[] = []
  const blocks: string[] = []

  for (const site of sites) {
    if (site.startsWith('!')) {
      exceptions.push(site.slice(1).replace(/^\./, ''))
    } else {
      blocks.push(site.replace(/^\./, ''))
    }
  }

  const lines: string[] = []

  // Exceptions first — return DIRECT before block rules
  for (const ex of exceptions) {
    lines.push(`  if (dnsDomainIs(host, "${ex}") || dnsDomainIs(host, ".${ex}")) return "DIRECT";`)
  }

  // Block rules
  if (blocks.length > 0) {
    const conditions = blocks
      .map((b) => `dnsDomainIs(host, "${b}") || dnsDomainIs(host, ".${b}")`)
      .join(' ||\n    ')
    lines.push(`  if (${conditions}) return "${DEAD_PROXY}";`)
  }

  lines.push('  return "DIRECT";')

  return `function FindProxyForURL(url, host) {\n${lines.join('\n')}\n}\n`
}

function listNetworkServices(): string[] {
  try {
    const out = execSync('networksetup -listallnetworkservices', {
      encoding: 'utf-8',
      timeout: 5000
    })
    return out
      .split('\n')
      .slice(1) // first line is a header
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('*'))
  } catch {
    return []
  }
}

function setAutoProxy(service: string, url: string): void {
  try {
    execSync(`networksetup -setautoproxyurl "${service}" "${url}"`, { timeout: 5000 })
  } catch {
    // best-effort per service
  }
}

function disableAutoProxy(service: string): void {
  try {
    execSync(`networksetup -setautoproxystate "${service}" off`, { timeout: 5000 })
  } catch {
    // best-effort per service
  }
}

export function startPacServer(): void {
  if (server) return

  server = createServer((_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/x-ns-proxy-autoconfig',
      'Cache-Control': 'no-cache'
    })
    res.end(pacContent)
  })
  server.listen(PAC_PORT, PAC_HOST)
}

export function stopPacServer(): void {
  if (!server) return
  server.close()
  server = null
}

export function enableBlocking(sites: string[]): boolean {
  if (sites.length === 0) return false

  pacContent = generatePac(sites)

  const pacUrl = `http://${PAC_HOST}:${PAC_PORT}/proxy.pac`
  const services = listNetworkServices()
  for (const svc of services) {
    setAutoProxy(svc, pacUrl)
  }

  blocking = true
  try {
    writeFileSync(sentinelPath(), Date.now().toString(), 'utf-8')
  } catch {
    // sentinel write is best-effort
  }

  return true
}

export function disableBlocking(): boolean {
  const services = listNetworkServices()
  for (const svc of services) {
    disableAutoProxy(svc)
  }

  blocking = false
  pacContent = ''

  try {
    if (existsSync(sentinelPath())) unlinkSync(sentinelPath())
  } catch {
    // sentinel cleanup is best-effort
  }

  return true
}

export function isBlockingActive(): boolean {
  return blocking
}

export function cleanupBlocking(): void {
  try {
    if (existsSync(sentinelPath())) {
      // Previous crash left blocking on — clean up
      const services = listNetworkServices()
      for (const svc of services) {
        disableAutoProxy(svc)
      }
      unlinkSync(sentinelPath())
    }
  } catch {
    // Cleanup is best-effort
  }
}
