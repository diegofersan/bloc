import { powerMonitor, BrowserWindow } from '../electron-api'

type IdleState = 'active' | 'warning' | 'idle'

const WARNING_THRESHOLD = 180 // 3 minutes
const IDLE_THRESHOLD = 300 // 5 minutes
const POLL_INTERVAL = 5000 // 5 seconds
const ACTIVE_THRESHOLD = 10 // seconds below which user is considered active

let intervalId: ReturnType<typeof setInterval> | null = null
let currentState: IdleState = 'active'

function sendToAllWindows(channel: string, idleSeconds: number): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send(channel, idleSeconds)
  })
}

function checkIdle(): void {
  const idleTime = powerMonitor.getSystemIdleTime()

  if (idleTime >= IDLE_THRESHOLD && currentState !== 'idle') {
    currentState = 'idle'
    sendToAllWindows('idle:timeout', idleTime)
  } else if (idleTime >= WARNING_THRESHOLD && currentState === 'active') {
    currentState = 'warning'
    sendToAllWindows('idle:warning', idleTime)
  } else if (idleTime < ACTIVE_THRESHOLD && currentState !== 'active') {
    currentState = 'active'
    sendToAllWindows('idle:active', idleTime)
  }
}

export function startIdleMonitor(): void {
  if (intervalId) return
  currentState = 'active'
  intervalId = setInterval(checkIdle, POLL_INTERVAL)
}

export function stopIdleMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}
