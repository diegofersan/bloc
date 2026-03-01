import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Check, X, Plus, Shield, Calendar, RefreshCw, LogOut } from 'lucide-react'
import { motion } from 'framer-motion'
import { useSettingsStore, formatTzOffset, type AIProvider } from '../stores/settingsStore'
import { usePomodoroStore } from '../stores/pomodoroStore'
import { useSiteBlockerStore } from '../stores/siteBlockerStore'
import { useGoogleCalendarStore } from '../stores/googleCalendarStore'

const providers: { id: AIProvider; name: string; description: string }[] = [
  { id: 'openai', name: 'OpenAI', description: 'GPT-4o & mais' },
  { id: 'anthropic', name: 'Anthropic', description: 'Claude Sonnet & mais' },
  { id: 'gemini', name: 'Gemini', description: 'Gemini Flash & mais' }
]

const COMMON_TIMEZONES = [
  'Pacific/Auckland', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
  'Asia/Dubai', 'Europe/Moscow', 'Europe/Istanbul', 'Europe/Athens',
  'Europe/Berlin', 'Europe/Paris', 'Europe/Lisbon', 'Europe/London',
  'Atlantic/Azores', 'America/Sao_Paulo', 'America/Buenos_Aires',
  'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
  'Africa/Cairo', 'Africa/Lagos', 'Asia/Singapore', 'Asia/Seoul',
  'Australia/Sydney', 'America/Toronto', 'America/Mexico_City',
  'Europe/Madrid', 'Europe/Rome'
]

const shortcuts = [
  { keys: '⌘ ,', action: 'Definições' },
  { keys: '⌘ I', action: 'Caixa de entrada' },
  { keys: '⌘ ⇧ D', action: 'Captura rápida' },
  { keys: '⌘ Z', action: 'Desfazer eliminação' }
]

export default function SettingsView() {
  const navigate = useNavigate()
  const { provider, apiKey, model, setProvider, setApiKey, setModel, primaryTimezone, secondaryTimezone, setPrimaryTimezone, setSecondaryTimezone } = useSettingsStore()
  const { workDuration, breakDuration, setWorkDuration, setBreakDuration } = usePomodoroStore()

  const { blockedSites, blockDuringPomodoro, addSite, removeSite, setBlockDuringPomodoro } = useSiteBlockerStore()
  const {
    isConnected: gcalConnected,
    selectedCalendarId,
    calendars: gcalCalendars,
    setConnected: setGcalConnected,
    setSelectedCalendar,
    setCalendars: setGcalCalendars,
    reset: resetGcal
  } = useGoogleCalendarStore()
  const [newSite, setNewSite] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [gcalLoading, setGcalLoading] = useState(false)
  const appVersion = window.bloc?.getAppVersion() ?? ''

  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Check Google Calendar auth status on mount
  useEffect(() => {
    async function checkAuth() {
      const authenticated = await window.bloc?.gcal.isAuthenticated()
      if (authenticated && !gcalConnected) {
        setGcalConnected(true)
      } else if (!authenticated && gcalConnected) {
        resetGcal()
      }
    }
    checkAuth()
  }, [])

  const [gcalError, setGcalError] = useState<string | null>(null)

  const handleGcalConnect = useCallback(async () => {
    setGcalLoading(true)
    setGcalError(null)
    try {
      const result = await window.bloc?.gcal.startAuth()
      if (result?.success) {
        setGcalConnected(true)
        // Load calendars after connecting
        const calResult = await window.bloc?.gcal.listCalendars()
        if (calResult?.success) {
          setGcalCalendars(calResult.calendars)
          // Auto-select primary calendar
          const primary = calResult.calendars.find((c: { primary?: boolean }) => c.primary)
          if (primary && !selectedCalendarId) {
            setSelectedCalendar(primary.id)
          }
        }
      } else {
        setGcalError(result?.error || 'Falha ao ligar conta Google')
      }
    } catch (err) {
      setGcalError((err as Error).message || 'Erro inesperado')
    } finally {
      setGcalLoading(false)
    }
  }, [setGcalConnected, setGcalCalendars, selectedCalendarId, setSelectedCalendar])

  const handleGcalDisconnect = useCallback(async () => {
    await window.bloc?.gcal.disconnect()
    resetGcal()
  }, [resetGcal])

  const handleRefreshCalendars = useCallback(async () => {
    setGcalLoading(true)
    try {
      const result = await window.bloc?.gcal.listCalendars()
      if (result?.success) {
        setGcalCalendars(result.calendars)
      }
    } finally {
      setGcalLoading(false)
    }
  }, [setGcalCalendars])

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Titlebar */}
      <div className={`titlebar-drag shrink-0 flex items-end pb-2 ${isNarrow ? 'px-3 pt-[38px]' : 'pl-5 pr-6 pt-[50px]'}`}>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/')}
          aria-label="Voltar"
          className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <ArrowLeft size={18} />
        </motion.button>
      </div>

      <div className={`flex-1 overflow-y-auto pb-12 ${isNarrow ? 'px-3' : 'pl-5 pr-6'}`}>
        <div className="max-w-xl">
          {/* Header */}
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 pt-4">
            Definições
          </h2>
          <p className="text-xs text-text-muted mb-8">As definições são guardadas automaticamente</p>

          {/* AI Section */}
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Inteligência Artificial</h3>

          {/* AI Provider */}
          <section className="mb-8">
            <label className="block text-sm font-medium text-text-secondary mb-3">
              Fornecedor de IA
            </label>
            <div className={`grid gap-3 ${isNarrow ? 'grid-cols-1' : 'grid-cols-3'}`}>
              {providers.map((p) => {
                const active = provider === p.id
                return (
                  <motion.button
                    key={p.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setProvider(p.id)}
                    className={`relative rounded-xl p-4 text-left border transition-colors ${
                      active
                        ? 'bg-accent/10 border-accent'
                        : 'bg-bg-secondary border-border hover:border-border-light'
                    }`}
                  >
                    {active && (
                      <motion.div
                        layoutId="provider-check"
                        className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-accent flex items-center justify-center"
                      >
                        <Check size={12} className="text-white" />
                      </motion.div>
                    )}
                    <div className={`text-sm font-medium ${active ? 'text-accent-hover' : 'text-text-primary'}`}>
                      {p.name}
                    </div>
                    <div className="text-xs text-text-muted mt-1">{p.description}</div>
                  </motion.button>
                )
              })}
            </div>
          </section>

          {/* API Key */}
          <section className="mb-6">
            <label className="block text-sm font-medium text-text-secondary mb-2">Chave API</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Insira a sua chave API"
                className="w-full rounded-lg bg-bg-secondary border border-border px-4 py-3 pr-12 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </section>

          {/* Model */}
          <section className="mb-0">
            <label className="block text-sm font-medium text-text-secondary mb-2">Modelo</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-lg bg-bg-secondary border border-border px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </section>

          <hr className="border-border my-8" />

          {/* Pomodoro Section */}
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Pomodoro</h3>

          <section className="mb-0">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Foco (min)</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={workDuration}
                  onChange={(e) => setWorkDuration(Number(e.target.value) || 1)}
                  className="w-full rounded-lg bg-bg-secondary border border-border px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Descanso (min)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={breakDuration}
                  onChange={(e) => setBreakDuration(Number(e.target.value) || 1)}
                  className="w-full rounded-lg bg-bg-secondary border border-border px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                />
              </div>
            </div>
          </section>

          <hr className="border-border my-8" />

          {/* Site Blocker Section */}
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Bloqueio de Sites</h3>

          <section className="mb-0">
            {/* Toggle */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="text-sm font-medium text-text-secondary">Bloquear durante Pomodoro</label>
                <p className="text-xs text-text-muted mt-0.5">Bloqueia sites distractivos durante sessões de foco</p>
              </div>
              <button
                onClick={() => setBlockDuringPomodoro(!blockDuringPomodoro)}
                className={`relative w-10 h-6 rounded-full transition-colors ${
                  blockDuringPomodoro ? 'bg-accent' : 'bg-bg-tertiary'
                }`}
              >
                <motion.div
                  className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm"
                  animate={{ x: blockDuringPomodoro ? 16 : 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              </button>
            </div>

            {/* Add site input */}
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newSite}
                onChange={(e) => setNewSite(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSite.trim()) {
                    addSite(newSite)
                    setNewSite('')
                  }
                }}
                placeholder="ex: twitter.com"
                className="flex-1 rounded-lg bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (newSite.trim()) {
                    addSite(newSite)
                    setNewSite('')
                  }
                }}
                className="px-3 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
              >
                <Plus size={16} />
              </motion.button>
            </div>

            {/* Sites list */}
            {blockedSites.length > 0 ? (
              <div className="space-y-1.5">
                {blockedSites.map((site) => (
                  <div
                    key={site}
                    className="flex items-center justify-between rounded-lg bg-bg-secondary border border-border px-4 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <Shield size={14} className="text-text-muted" />
                      <span className="text-sm text-text-primary">{site}</span>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => removeSite(site)}
                      className="p-1 rounded text-text-muted hover:text-red-500 transition-colors"
                    >
                      <X size={14} />
                    </motion.button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted">Nenhum site bloqueado</p>
            )}
          </section>

          <hr className="border-border my-8" />

          {/* Google Calendar Section */}
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Google Calendar</h3>

          <section className="mb-0">
            {!gcalConnected ? (
              <div>
                <p className="text-xs text-text-muted mb-3">
                  Sincronize blocos de tempo com o Google Calendar
                </p>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleGcalConnect}
                  disabled={gcalLoading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  <Calendar size={16} />
                  {gcalLoading ? 'A ligar...' : 'Ligar conta Google'}
                </motion.button>
                {gcalError && (
                  <p className="mt-2 text-xs text-red-500">{gcalError}</p>
                )}
              </div>
            ) : (
              <div>
                {/* Connected status */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success" />
                    <span className="text-sm text-text-secondary font-medium">Conta ligada</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleRefreshCalendars}
                      disabled={gcalLoading}
                      className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors"
                      aria-label="Atualizar calendários"
                    >
                      <RefreshCw size={14} className={gcalLoading ? 'animate-spin' : ''} />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleGcalDisconnect}
                      className="p-1.5 rounded-lg text-text-muted hover:text-error transition-colors"
                      aria-label="Desligar"
                    >
                      <LogOut size={14} />
                    </motion.button>
                  </div>
                </div>

                {/* Calendar picker */}
                {gcalCalendars.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">Calendário</label>
                    <div className="space-y-1.5">
                      {gcalCalendars.map((cal) => (
                        <button
                          key={cal.id}
                          onClick={() => setSelectedCalendar(cal.id)}
                          className={`w-full flex items-center gap-3 rounded-lg px-4 py-2.5 text-left border transition-colors ${
                            selectedCalendarId === cal.id
                              ? 'bg-accent/10 border-accent'
                              : 'bg-bg-secondary border-border hover:border-border-light'
                          }`}
                        >
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: cal.backgroundColor }}
                          />
                          <span className="text-sm text-text-primary truncate">{cal.summary}</span>
                          {selectedCalendarId === cal.id && (
                            <Check size={14} className="ml-auto text-accent shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <hr className="border-border my-8" />

          {/* Timezone Section */}
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Fusos Horários</h3>

          <section className="mb-0">
            <div className="mb-4">
              <label className="block text-sm font-medium text-text-secondary mb-2">Fuso horário primário</label>
              <select
                value={primaryTimezone}
                onChange={(e) => setPrimaryTimezone(e.target.value)}
                className="w-full rounded-lg bg-bg-secondary border border-border px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz} ({formatTzOffset(tz)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Fuso horário secundário</label>
              <select
                value={secondaryTimezone ?? ''}
                onChange={(e) => setSecondaryTimezone(e.target.value || null)}
                className="w-full rounded-lg bg-bg-secondary border border-border px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              >
                <option value="">Nenhum</option>
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz} ({formatTzOffset(tz)})
                  </option>
                ))}
              </select>
            </div>
          </section>

          <hr className="border-border my-8" />

          {/* Keyboard Shortcuts Section */}
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Atalhos de teclado</h3>

          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
            {shortcuts.map((s) => (
              <div key={s.keys} className="contents">
                <span className="text-xs text-text-muted">
                  <kbd className="bg-bg-secondary rounded px-1.5 py-0.5 font-mono">{s.keys}</kbd>
                </span>
                <span className="text-xs text-text-muted">{s.action}</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <p className="text-xs text-text-muted mt-8 pb-4">
            {appVersion ? `Bloc v${appVersion}` : 'Bloc'}
          </p>
        </div>
      </div>
    </div>
  )
}
