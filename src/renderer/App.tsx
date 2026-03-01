import { useState, useEffect, useCallback, useRef } from 'react'
import { HashRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Play } from 'lucide-react'
import CalendarView from './views/CalendarView'
import TimelineView from './views/TimelineView'
import InboxView from './views/InboxView'
import SettingsView from './views/SettingsView'
import QuickCaptureOverlay from './components/QuickCaptureOverlay'
import DailyStandupModal from './components/DailyStandupModal'
import Toast from './components/Toast'
import { useTaskStore } from './stores/taskStore'
import { useSiteBlockerStore } from './stores/siteBlockerStore'
import { usePomodoroStore, type PomodoroStatus } from './stores/pomodoroStore'
import { initSync, cleanup as cleanupSync } from './services/syncService'
import { startPeriodicSync, stopPeriodicSync } from './services/googleCalendarSync'
import { useGoogleCalendarStore } from './stores/googleCalendarStore'

declare global {
  interface Window {
    bloc?: {
      getAppVersion: () => string
      onNavigate: (callback: (path: string) => void) => () => void
      onQuickCapture: (callback: () => void) => () => void
      updatePomodoroTray: (time: string | null, status: string | null) => void
      onUpdateAvailable: (callback: (version: string) => void) => () => void
      onUpdateDownloaded: (callback: (version: string) => void) => () => void
      installUpdate: () => void
      icloud: {
        checkAvailability: () => Promise<{ available: boolean; path: string }>
        readDay: (date: string) => Promise<unknown>
        writeDay: (data: unknown) => Promise<boolean>
        readAllDays: () => Promise<unknown[]>
        listDays: () => Promise<string[]>
        watchDates: (dates: string[]) => Promise<boolean>
        stopWatching: () => Promise<boolean>
        onFileChanged: (callback: (data: unknown) => void) => () => void
      }
      siteBlocker: {
        enable: (sites: string[]) => Promise<boolean>
        disable: () => Promise<boolean>
        isActive: () => Promise<boolean>
        cleanup: () => Promise<void>
      }
      gcal: {
        startAuth: () => Promise<{ success: boolean; error?: string }>
        isAuthenticated: () => Promise<boolean>
        disconnect: () => Promise<{ success: boolean }>
        listCalendars: () => Promise<{ success: boolean; calendars: Array<{ id: string; summary: string; backgroundColor: string; primary?: boolean }> }>
        listEvents: (calendarId: string, opts?: Record<string, unknown>) => Promise<{ success: boolean; items: unknown[]; nextSyncToken?: string }>
        createEvent: (calendarId: string, eventData: unknown) => Promise<{ success: boolean; event?: unknown; error?: string }>
        updateEvent: (calendarId: string, eventId: string, eventData: unknown) => Promise<{ success: boolean; event?: unknown; error?: string }>
        deleteEvent: (calendarId: string, eventId: string) => Promise<{ success: boolean; error?: string }>
      }
    }
  }
}

function NavigationListener() {
  const navigate = useNavigate()

  useEffect(() => {
    const cleanup = window.bloc?.onNavigate((path) => {
      navigate(path)
    })
    return () => cleanup?.()
  }, [navigate])

  return null
}

function PomodoroRouteGuard() {
  const location = useLocation()
  const status = usePomodoroStore((s) => s.status)
  const pomodoroDate = usePomodoroStore((s) => s.pomodoroDate)
  const autoPaused = usePomodoroStore((s) => s.autoPaused)
  const autoPause = usePomodoroStore((s) => s.autoPause)
  const autoResume = usePomodoroStore((s) => s.autoResume)

  useEffect(() => {
    if (status === 'idle' || !pomodoroDate) return

    const isOnPomodoroDay = location.pathname === `/day/${pomodoroDate}`

    if (!isOnPomodoroDay) {
      autoPause()
    } else if (autoPaused) {
      autoResume()
    }
  }, [location.pathname, status, pomodoroDate, autoPaused, autoPause, autoResume])

  return null
}

function PomodoroReturnBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const status = usePomodoroStore((s) => s.status)
  const pomodoroDate = usePomodoroStore((s) => s.pomodoroDate)
  const secondsRemaining = usePomodoroStore((s) => s.secondsRemaining)

  if (status === 'idle' || !pomodoroDate) return null
  if (location.pathname === `/day/${pomodoroDate}`) return null

  const m = Math.floor(secondsRemaining / 60)
  const s = secondsRemaining % 60
  const time = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  const statusColor = status === 'working' ? 'text-accent' : 'text-success'

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
      onClick={() => navigate(`/day/${pomodoroDate}`)}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-bg-secondary border border-border shadow-lg hover:bg-bg-hover transition-colors cursor-pointer"
    >
      <Play size={14} className={statusColor} />
      <span className={`text-xs font-medium tabular-nums ${statusColor}`}>{time}</span>
      <span className="text-xs font-medium text-text-secondary">Voltar ao trabalho</span>
    </motion.button>
  )
}

function AnimatedRoutes() {
  const location = useLocation()

  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12 }}
      className="h-full"
    >
      <Routes location={location}>
        <Route path="/" element={<CalendarView />} />
        <Route path="/day/:date" element={<TimelineView />} />
        <Route path="/inbox" element={<InboxView />} />
        <Route path="/settings" element={<SettingsView />} />
      </Routes>
    </motion.div>
  )
}

interface ToastState {
  message: string
  visible: boolean
  duration?: number
  action?: { label: string; onClick: () => void }
}

export default function App() {
  const [showCapture, setShowCapture] = useState(false)
  const [showStandup, setShowStandup] = useState(false)
  const [toast, setToast] = useState<ToastState>({ message: '', visible: false })
  const lastDeleted = useTaskStore((s) => s.lastDeleted)
  const undoDelete = useTaskStore((s) => s.undoDelete)
  const cleanOldDistractions = useTaskStore((s) => s.cleanOldDistractions)
  const clearDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toggleCapture = useCallback(() => setShowCapture((v) => !v), [])

  // Auto-update listeners
  useEffect(() => {
    const cleanupAvailable = window.bloc?.onUpdateAvailable((version) => {
      setToast({ message: `A transferir atualização v${version}...`, visible: true })
    })
    const cleanupDownloaded = window.bloc?.onUpdateDownloaded((version) => {
      setToast({
        message: `Atualização v${version} pronta`,
        visible: true,
        duration: 0,
        action: {
          label: 'Reiniciar',
          onClick: () => window.bloc?.installUpdate()
        }
      })
    })
    return () => {
      cleanupAvailable?.()
      cleanupDownloaded?.()
    }
  }, [])

  // iCloud sync init
  useEffect(() => {
    initSync()
    return () => cleanupSync()
  }, [])

  // Google Calendar periodic sync
  const gcalConnected = useGoogleCalendarStore((s) => s.isConnected)
  const gcalCalendarId = useGoogleCalendarStore((s) => s.selectedCalendarId)

  useEffect(() => {
    if (gcalConnected && gcalCalendarId) {
      startPeriodicSync()
    } else {
      stopPeriodicSync()
    }
    return () => stopPeriodicSync()
  }, [gcalConnected, gcalCalendarId])

  // Pomodoro state for tray + site blocker
  const pomodoroStatus = usePomodoroStore((s) => s.status)
  const pomodoroSeconds = usePomodoroStore((s) => s.secondsRemaining)
  const pomodoroIsPaused = usePomodoroStore((s) => s.isPaused)

  // Global tray update (always mounted, survives view changes)
  useEffect(() => {
    if (pomodoroStatus === 'idle') {
      window.bloc?.updatePomodoroTray(null, null)
      return
    }
    const m = Math.floor(pomodoroSeconds / 60)
    const s = pomodoroSeconds % 60
    const time = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    const pauseIndicator = pomodoroIsPaused ? ' ⏸' : ''
    window.bloc?.updatePomodoroTray(`${time}${pauseIndicator}`, pomodoroStatus)
  }, [pomodoroStatus, pomodoroSeconds, pomodoroIsPaused])

  // Site blocker: react to pomodoro status changes
  const blockDuringPomodoro = useSiteBlockerStore((s) => s.blockDuringPomodoro)
  const blockedSites = useSiteBlockerStore((s) => s.blockedSites)
  const setIsBlocking = useSiteBlockerStore((s) => s.setIsBlocking)

  const prevPomodoroStatus = useRef<PomodoroStatus>('idle')

  useEffect(() => {
    const prev = prevPomodoroStatus.current
    prevPomodoroStatus.current = pomodoroStatus

    if (!blockDuringPomodoro || blockedSites.length === 0) return

    async function handleStatusChange() {
      // Starting work: enable blocking
      if (pomodoroStatus === 'working' && prev !== 'working') {
        const ok = await window.bloc?.siteBlocker.enable(blockedSites)
        if (ok) setIsBlocking(true)
      }
      // Leaving work (break or idle): disable blocking
      if (pomodoroStatus !== 'working' && prev === 'working') {
        const ok = await window.bloc?.siteBlocker.disable()
        if (ok) setIsBlocking(false)
      }
    }

    handleStatusChange()
  }, [pomodoroStatus, blockDuringPomodoro, blockedSites, setIsBlocking])

  // Cleanup old distractions on mount
  useEffect(() => {
    cleanOldDistractions()
  }, [cleanOldDistractions])

  // IPC listener for quick capture
  useEffect(() => {
    const cleanup = window.bloc?.onQuickCapture(toggleCapture)
    return () => cleanup?.()
  }, [toggleCapture])

  // In-app keyboard shortcut fallback
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        toggleCapture()
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        setShowStandup((v) => !v)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleCapture])

  // Cmd+Z undo delete
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        if (lastDeleted) {
          e.preventDefault()
          undoDelete()
          setToast({ message: 'Tarefa restaurada', visible: true })
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lastDeleted, undoDelete])

  // Show undo toast when task is deleted
  useEffect(() => {
    if (lastDeleted) {
      setToast({
        message: 'Tarefa eliminada',
        visible: true,
        action: {
          label: 'Desfazer (⌘Z)',
          onClick: () => {
            undoDelete()
            setToast({ message: 'Tarefa restaurada', visible: true })
          }
        }
      })
      // Auto-clear lastDeleted after 5 seconds
      if (clearDeleteTimerRef.current) clearTimeout(clearDeleteTimerRef.current)
      clearDeleteTimerRef.current = setTimeout(() => {
        useTaskStore.setState({ lastDeleted: null })
      }, 5000)
    }
    return () => {
      if (clearDeleteTimerRef.current) clearTimeout(clearDeleteTimerRef.current)
    }
  }, [lastDeleted, undoDelete])

  function showCapturedToast() {
    setToast({ message: 'Distração anotada', visible: true })
  }

  return (
    <HashRouter>
      <div className="h-full bg-bg-primary text-text-primary">
        <NavigationListener />
        <PomodoroRouteGuard />
        <AnimatedRoutes />
        <PomodoroReturnBar />
        <QuickCaptureOverlay
          visible={showCapture}
          onClose={() => setShowCapture(false)}
          onCaptured={showCapturedToast}
        />
        <DailyStandupModal
          visible={showStandup}
          onClose={() => setShowStandup(false)}
        />
        <Toast
          message={toast.message}
          visible={toast.visible}
          duration={toast.duration}
          onClose={() => setToast((t) => ({ ...t, visible: false }))}
          action={toast.action}
        />
      </div>
    </HashRouter>
  )
}
