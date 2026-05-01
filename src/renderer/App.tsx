import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Play } from 'lucide-react'
import CalendarView from './views/CalendarView'
import TimelineView from './views/TimelineView'
import InboxView from './views/InboxView'
import SettingsView from './views/SettingsView'
import TrashView from './views/TrashView'
import RadarView from './views/RadarView'
const ReviewView = lazy(() => import('./components/review/ReviewView'))
import QuickCaptureOverlay from './components/QuickCaptureOverlay'
import DailyStandupModal from './components/DailyStandupModal'
import Toast from './components/Toast'
import BlockExplosion from './components/BlockExplosion'
import IdeaButton from './components/IdeaButton'
import { useTaskStore } from './stores/taskStore'
import { useTimeBlockStore } from './stores/timeBlockStore'
import { useClipboardStore } from './stores/clipboardStore'
import ClipboardBar from './components/ClipboardBar'
import { useSiteBlockerStore } from './stores/siteBlockerStore'
import { usePomodoroStore } from './stores/pomodoroStore'
import { playIdleWarningSound } from './services/notificationSound'
import { initSync, cleanup as cleanupSync } from './services/syncService'
import { startPeriodicSync, stopPeriodicSync } from './services/googleCalendarSync'
import { useGoogleCalendarStore } from './stores/googleCalendarStore'
import { useFlowStore } from './stores/flowStore'

declare global {
  interface Window {
    bloc?: {
      getAppVersion: () => string
      focusWindow: () => void
      alertAttention: () => void
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
        readReview: (week: string) => Promise<unknown>
        writeReview: (data: unknown) => Promise<boolean>
        listReviews: () => Promise<string[]>
        readBlocks: () => Promise<unknown>
        writeBlocks: (data: unknown) => Promise<boolean>
        onFileChanged: (callback: (data: unknown) => void) => () => void
        onBlocksFileChanged: (callback: (data: unknown) => void) => () => void
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

  // ⌘⇧W → weekly review
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        navigate('/review')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return null
}

function FlowRouteGuard() {
  const location = useLocation()
  const flowIsActive = useFlowStore((s) => s.isActive)
  const flowDate = useFlowStore((s) => s.date)
  const flowPause = useFlowStore((s) => s.pause)
  const flowResume = useFlowStore((s) => s.resume)
  const flowIsPaused = useFlowStore((s) => s.isPaused)
  const pausedByGuard = useRef(false)

  useEffect(() => {
    if (!flowIsActive || !flowDate) {
      pausedByGuard.current = false
      return
    }

    const isOnFlowDay = location.pathname === `/day/${flowDate}`

    if (!isOnFlowDay && !flowIsPaused) {
      flowPause()
      pausedByGuard.current = true
    } else if (isOnFlowDay && flowIsPaused && pausedByGuard.current) {
      flowResume()
      pausedByGuard.current = false
    }
  }, [location.pathname, flowIsActive, flowDate, flowIsPaused, flowPause, flowResume])

  return null
}

function FlowReturnBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const flowIsActive = useFlowStore((s) => s.isActive)
  const flowDate = useFlowStore((s) => s.date)

  if (!flowIsActive || !flowDate) return null
  if (location.pathname === `/day/${flowDate}`) return null

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
      onClick={() => navigate(`/day/${flowDate}`)}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-bg-secondary border border-border shadow-lg hover:bg-bg-hover transition-colors cursor-pointer"
    >
      <Play size={14} className="text-violet-500" />
      <span className="text-xs font-medium text-text-secondary">Voltar ao fluxo</span>
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
        <Route path="/trash" element={<TrashView />} />
        <Route path="/radar" element={<RadarView />} />
        <Route
          path="/review"
          element={
            <Suspense fallback={null}>
              <ReviewView />
            </Suspense>
          }
        />
        <Route
          path="/review/:week"
          element={
            <Suspense fallback={null}>
              <ReviewView />
            </Suspense>
          }
        />
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

  // Flow state for tray + site blocker
  const flowIsActiveApp = useFlowStore((s) => s.isActive)
  const flowPhaseApp = useFlowStore((s) => s.phase)
  const flowSecondsApp = useFlowStore((s) => s.secondsRemaining)
  const flowIsPausedApp = useFlowStore((s) => s.isPaused)

  // Global tray update (always mounted, survives view changes)
  const flowStartedTray = useFlowStore((s) => s.started)
  useEffect(() => {
    if (!flowIsActiveApp || !flowStartedTray) {
      window.bloc?.updatePomodoroTray(null, null)
      return
    }
    const m = Math.floor(flowSecondsApp / 60)
    const s = flowSecondsApp % 60
    const time = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    const pauseIndicator = flowIsPausedApp ? ' ⏸' : ''
    window.bloc?.updatePomodoroTray(`${time}${pauseIndicator}`, flowPhaseApp)
  }, [flowIsActiveApp, flowStartedTray, flowSecondsApp, flowIsPausedApp, flowPhaseApp])

  // Site blocker: react to flow phase changes (block during work, unblock during break)
  const blockDuringPomodoro = useSiteBlockerStore((s) => s.blockDuringPomodoro)
  const blockedSites = useSiteBlockerStore((s) => s.blockedSites)
  const setIsBlocking = useSiteBlockerStore((s) => s.setIsBlocking)
  const flowStartedApp = useFlowStore((s) => s.started)

  useEffect(() => {
    if (!blockDuringPomodoro || blockedSites.length === 0) return

    async function handleStatusChange() {
      const shouldBlock = flowIsActiveApp && flowStartedApp && flowPhaseApp === 'working'

      if (shouldBlock) {
        const ok = await window.bloc?.siteBlocker.enable(blockedSites)
        if (ok) setIsBlocking(true)
      } else {
        const ok = await window.bloc?.siteBlocker.disable()
        if (ok) setIsBlocking(false)
      }
    }

    handleStatusChange()
  }, [flowIsActiveApp, flowStartedApp, flowPhaseApp, blockDuringPomodoro, blockedSites, setIsBlocking])

  // Idle detection: sound warning, auto-pause, auto-resume
  useEffect(() => {
    if (!window.bloc?.idle) return

    const cleanupWarning = window.bloc.idle.onWarning(() => {
      playIdleWarningSound()
    })

    const cleanupTimeout = window.bloc.idle.onTimeout(() => {
      const pomodoroState = usePomodoroStore.getState()
      if (pomodoroState.status !== 'idle' && !pomodoroState.isPaused) {
        pomodoroState.autoPause()
      }

      const flowState = useFlowStore.getState()
      if (flowState.isActive && flowState.started && !flowState.isPaused) {
        flowState.autoPause()
      }

      new Notification('Bloc \u2014 Inatividade detectada', {
        body: 'O temporizador foi pausado automaticamente.',
        silent: true
      })
    })

    const cleanupActive = window.bloc.idle.onActive(() => {
      const pomodoroState = usePomodoroStore.getState()
      if (pomodoroState.autoPaused) {
        pomodoroState.autoResume()
      }

      const flowState = useFlowStore.getState()
      if (flowState.autoPaused) {
        flowState.autoResume()
      }
    })

    return () => {
      cleanupWarning()
      cleanupTimeout()
      cleanupActive()
    }
  }, [])

  // Cleanup old distractions on mount
  useEffect(() => {
    cleanOldDistractions()
  }, [cleanOldDistractions])

  // Cleanup old deleted blocks on mount
  const cleanOldDeletedBlocks = useTimeBlockStore((s) => s.cleanOldDeletedBlocks)
  useEffect(() => {
    cleanOldDeletedBlocks()
  }, [cleanOldDeletedBlocks])

  // IPC listener for quick capture
  useEffect(() => {
    const cleanup = window.bloc?.onQuickCapture(toggleCapture)
    return () => cleanup?.()
  }, [toggleCapture])

  // In-app keyboard shortcut fallback
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Escape clears clipboard (priority over navigation)
      if (e.key === 'Escape') {
        const clipboard = useClipboardStore.getState()
        if (clipboard.task) {
          clipboard.clearClipboard()
          e.stopImmediatePropagation()
          return
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        toggleCapture()
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        setShowStandup((v) => !v)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
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

  // Show undo toast when task is deleted or moved
  useEffect(() => {
    if (lastDeleted) {
      const isMoved = !!lastDeleted.movedTo
      setToast({
        message: isMoved ? 'Tarefa movida' : 'Tarefa eliminada',
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
        <FlowRouteGuard />
        <AnimatedRoutes />
        <ClipboardBar />
        <FlowReturnBar />
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
        <BlockExplosion />
        <IdeaButton
          onToast={(msg, action) => setToast({ message: msg, visible: true, action })}
        />
      </div>
    </HashRouter>
  )
}
