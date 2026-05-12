import { useNavigate } from 'react-router-dom'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { useGoogleCalendarStore } from '../stores/googleCalendarStore'

/**
 * Floating top-right indicator for Google Calendar sync state.
 * - Hidden when not connected, or when last sync was successful.
 * - Subtle spinner while syncing.
 * - Red alert button (clickable → Settings) when the last sync failed.
 */
export default function GoogleSyncStatusBadge() {
  const navigate = useNavigate()
  const isConnected = useGoogleCalendarStore((s) => s.isConnected)
  const isSyncing = useGoogleCalendarStore((s) => s.isSyncing)
  const syncError = useGoogleCalendarStore((s) => s.syncError)

  if (!isConnected) return null

  if (syncError) {
    return (
      <button
        onClick={() => navigate('/settings')}
        title={`Sync com Google Calendar falhou: ${syncError}. Clica para ver detalhes.`}
        aria-label="Erro de sync com Google Calendar"
        className="fixed top-3 right-3 z-40 flex items-center gap-1 px-2 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-600 hover:bg-rose-500/25 transition-colors"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <AlertTriangle size={12} />
        <span className="text-[10px] font-medium">Sync falhou</span>
      </button>
    )
  }

  if (isSyncing) {
    return (
      <div
        title="A sincronizar com Google Calendar…"
        aria-label="A sincronizar com Google Calendar"
        className="fixed top-3 right-3 z-40 flex items-center justify-center w-6 h-6 rounded-full bg-bg-secondary/60 text-text-muted pointer-events-none"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <RefreshCw size={11} className="animate-spin" />
      </div>
    )
  }

  return null
}
