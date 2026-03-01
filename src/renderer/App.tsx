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
