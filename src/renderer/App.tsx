import { useState, useEffect, useCallback, useRef } from 'react'
import { HashRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import CalendarView from './views/CalendarView'
import DayView from './views/DayView'
import InboxView from './views/InboxView'
import SettingsView from './views/SettingsView'
import QuickCaptureOverlay from './components/QuickCaptureOverlay'
import Toast from './components/Toast'
import { useTaskStore } from './stores/taskStore'
import { useSiteBlockerStore } from './stores/siteBlockerStore'
import { usePomodoroStore, type PomodoroStatus } from './stores/pomodoroStore'
import { initSync, cleanup as cleanupSync } from './services/syncService'

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

function AnimatedRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.15, ease: 'easeInOut' }}
        className="h-full"
      >
        <Routes location={location}>
          <Route path="/" element={<CalendarView />} />
          <Route path="/day/:date" element={<DayView />} />
          <Route path="/inbox" element={<InboxView />} />
          <Route path="/settings" element={<SettingsView />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
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

  // Site blocker: react to pomodoro status changes
  const pomodoroStatus = usePomodoroStore((s) => s.status)
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
        <AnimatedRoutes />
        <QuickCaptureOverlay
          visible={showCapture}
          onClose={() => setShowCapture(false)}
          onCaptured={showCapturedToast}
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
