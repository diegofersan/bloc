import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format, parseISO, addDays, startOfWeek, isSameWeek } from 'date-fns'
import { pt } from 'date-fns/locale'
import { ArrowLeft, ChevronLeft, ChevronRight, Sparkles, AlertCircle } from 'lucide-react'
import { useWeeklyPlanningUiStore } from '../stores/weeklyPlanningUiStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useTaskStore } from '../stores/taskStore'
import { useGoogleCalendarStore } from '../stores/googleCalendarStore'
import { loadDayFromICloud } from '../services/syncService'
import { syncDate } from '../services/googleCalendarSync'
import WeekDayColumn from '../components/weekly/WeekDayColumn'
import PendingPanel from '../components/weekly/PendingPanel'
import AutoDistributeModal from '../components/weekly/AutoDistributeModal'
import Toast from '../components/Toast'

function fmt(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

function mondayOf(date: Date): string {
  return fmt(startOfWeek(date, { weekStartsOn: 1 }))
}

interface ToastState {
  message: string
  visible: boolean
  action?: { label: string; onClick: () => void }
}

export default function WeeklyPlanningView() {
  const navigate = useNavigate()
  const { weekStart: paramWeekStart } = useParams<{ weekStart?: string }>()
  const storedWeekStart = useWeeklyPlanningUiStore((s) => s.weekStart)
  const setWeekStart = useWeeklyPlanningUiStore((s) => s.setWeekStart)
  const weekViewDays = useSettingsStore((s) => s.weekViewDays)
  const setWeekViewDays = useSettingsStore((s) => s.setWeekViewDays)
  const distributeTasks = useTaskStore((s) => s.distributeTasks)
  const undoLastDistribution = useTaskStore((s) => s.undoLastDistribution)
  const gcalConnected = useGoogleCalendarStore((s) => s.isConnected)
  const gcalError = useGoogleCalendarStore((s) => s.syncError)

  const [loading, setLoading] = useState(true)
  const [showDistribute, setShowDistribute] = useState(false)
  const [toast, setToast] = useState<ToastState>({ message: '', visible: false })

  // Resolve weekStart: URL param > store > current week's Monday
  const weekStart = useMemo(() => {
    const candidate = paramWeekStart ?? storedWeekStart ?? mondayOf(new Date())
    // Normalise to Monday in case caller passed a non-Monday date
    return mondayOf(parseISO(candidate))
  }, [paramWeekStart, storedWeekStart])

  // Persist URL → store
  useEffect(() => {
    if (storedWeekStart !== weekStart) {
      setWeekStart(weekStart)
    }
  }, [weekStart, storedWeekStart, setWeekStart])

  const dates = useMemo(() => {
    const start = parseISO(weekStart)
    return Array.from({ length: weekViewDays }, (_, i) => fmt(addDays(start, i)))
  }, [weekStart, weekViewDays])

  // Load + watch on date changes (week + ref origins)
  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function load() {
      const work: Promise<unknown>[] = []
      for (const d of dates) work.push(loadDayFromICloud(d))
      if (gcalConnected) {
        for (const d of dates) work.push(syncDate(d))
      }
      await Promise.all(work).catch(() => undefined)

      // Second pass: load origin files for any ref in the visible week so block
      // resolution can find the origin task's parent block. Without this, refs
      // whose origin is on a non-loaded day fall into "Bloco indefinido".
      const visibleRefOrigins = new Set<string>()
      const dateSet = new Set(dates)
      const refs = useTaskStore.getState().taskRefs
      for (const d of dates) {
        for (const r of refs[d] ?? []) {
          if (!dateSet.has(r.originDate)) visibleRefOrigins.add(r.originDate)
        }
      }
      if (visibleRefOrigins.size > 0) {
        await Promise.all(
          [...visibleRefOrigins].map((d) => loadDayFromICloud(d))
        ).catch(() => undefined)
      }

      if (!cancelled) setLoading(false)
    }

    load()
    window.bloc?.icloud.watchDates(dates).catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [dates, gcalConnected])

  const handlePrev = useCallback(() => {
    const next = fmt(addDays(parseISO(weekStart), -7))
    navigate(`/week/${next}`)
  }, [weekStart, navigate])

  const handleNext = useCallback(() => {
    const next = fmt(addDays(parseISO(weekStart), 7))
    navigate(`/week/${next}`)
  }, [weekStart, navigate])

  const handleThisWeek = useCallback(() => {
    navigate(`/week/${mondayOf(new Date())}`)
  }, [navigate])

  const isCurrentWeek = isSameWeek(parseISO(weekStart), new Date(), { weekStartsOn: 1 })

  function handleDistribute(plan: { originDate: string; taskId: string; targetDate: string }[]) {
    const result = distributeTasks(plan)
    setToast({
      message: `${result.applied.length} ${result.applied.length === 1 ? 'tarefa distribuída' : 'tarefas distribuídas'}`,
      visible: true,
      action: {
        label: 'Desfazer',
        onClick: () => {
          undoLastDistribution()
          setToast({ message: 'Distribuição desfeita', visible: true })
        }
      }
    })
  }

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Titlebar drag area */}
      <div className="titlebar-drag flex shrink-0 items-end justify-between pb-1 px-6 pt-[50px]">
        <button
          onClick={() => navigate('/')}
          aria-label="Voltar"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
        >
          <ArrowLeft size={16} />
          <span className="text-xs">Calendário</span>
        </button>
      </div>

      {/* Header */}
      <div className="shrink-0 px-6 py-3 flex items-center justify-between gap-3 border-b border-border">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-text-primary">Planeamento semanal</h1>
          <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={handlePrev}
              aria-label="Semana anterior"
              className="rounded-lg p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleNext}
              aria-label="Semana seguinte"
              className="rounded-lg p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              <ChevronRight size={16} />
            </button>
            {!isCurrentWeek && (
              <button
                onClick={handleThisWeek}
                className="rounded-lg px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10"
              >
                Esta semana
              </button>
            )}
          </div>
          <div className="text-xs text-text-muted ml-2">
            {format(parseISO(dates[0]), 'd MMM', { locale: pt })} – {format(parseISO(dates[dates.length - 1]), 'd MMM', { locale: pt })}
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="flex border border-border rounded-lg p-0.5">
            <button
              onClick={() => setWeekViewDays(5)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                weekViewDays === 5 ? 'bg-bg-secondary text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              5d
            </button>
            <button
              onClick={() => setWeekViewDays(7)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                weekViewDays === 7 ? 'bg-bg-secondary text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              7d
            </button>
          </div>
          <button
            onClick={() => setShowDistribute(true)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-text-secondary border border-border hover:bg-bg-hover hover:text-text-primary"
          >
            <Sparkles size={12} />
            Distribuir auto
          </button>
        </div>
      </div>

      {gcalConnected && gcalError && (
        <div className="shrink-0 px-6 py-1.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex items-center gap-1.5">
          <AlertCircle size={12} />
          Erro no Google Calendar: {gcalError}
        </div>
      )}

      {/* Body: 2 columns */}
      <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: '1fr 280px' }}>
        <div className="min-h-0 overflow-hidden grid" style={{ gridTemplateColumns: `repeat(${weekViewDays}, minmax(0, 1fr))` }}>
          {loading
            ? Array.from({ length: weekViewDays }).map((_, i) => (
                <div
                  key={i}
                  className="h-full border-r border-border last:border-r-0 animate-pulse"
                >
                  <div className="px-2 py-2 border-b border-border">
                    <div className="h-3 w-10 bg-bg-hover rounded mb-1" />
                    <div className="h-3 w-14 bg-bg-hover rounded" />
                  </div>
                  <div className="p-2 space-y-1.5">
                    <div className="h-8 bg-bg-hover rounded" />
                    <div className="h-8 bg-bg-hover rounded" />
                  </div>
                </div>
              ))
            : dates.map((d) => <WeekDayColumn key={d} date={d} />)}
        </div>
        <PendingPanel weekDates={dates} />
      </div>

      <AutoDistributeModal
        open={showDistribute}
        weekDates={dates}
        onClose={() => setShowDistribute(false)}
        onApply={handleDistribute}
      />

      <Toast
        message={toast.message}
        visible={toast.visible}
        action={toast.action}
        onClose={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </div>
  )
}
