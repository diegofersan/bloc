import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO, addDays, subDays, startOfWeek } from 'date-fns'
import { pt } from 'date-fns/locale'
import { ArrowLeft, ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { useWeeklyReviewStore } from '../../stores/weeklyReviewStore'
import { getISOWeekId } from '../../utils/weekId'

function fmt(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

function mondayOf(date: Date): string {
  return fmt(startOfWeek(date, { weekStartsOn: 1 }))
}

interface Props {
  defaultWeekStart: string
  onPicked: (weekStart: string) => void
}

export default function WeekSelector({ defaultWeekStart, onPicked }: Props) {
  const navigate = useNavigate()
  const [weekStart, setWeekStart] = useState(defaultWeekStart)
  const startReview = useWeeklyReviewStore((s) => s.startReview)
  const discardDraft = useWeeklyReviewStore((s) => s.discardDraft)
  const activeDraft = useWeeklyReviewStore((s) => s.getActiveDraft())

  const weekEnd = useMemo(() => fmt(addDays(parseISO(weekStart), 6)), [weekStart])
  const targetWeekId = getISOWeekId(weekStart)
  const draftIsForOtherWeek =
    activeDraft && activeDraft.week !== targetWeekId

  function shift(deltaDays: number) {
    setWeekStart((current) => fmt(addDays(parseISO(current), deltaDays)))
  }

  function handleStart() {
    if (draftIsForOtherWeek) return
    startReview(weekStart)
    onPicked(weekStart)
  }

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      <div className="titlebar-drag flex shrink-0 items-end justify-start pb-1 px-6 pt-[50px]">
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

      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-semibold text-text-primary mb-1">Revisão semanal</h1>
          <p className="text-sm text-text-muted mb-8">
            Fecha a semana com retrospectiva, migra o que ficou pendente, reflecte e planeia a próxima.
          </p>

          {activeDraft && (
            <button
              onClick={() => navigate(`/review/${activeDraft.week}`)}
              className="w-full mb-6 flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4 text-left hover:bg-accent/10 transition-colors"
            >
              <FileText size={18} className="text-accent shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary">
                  Revisão em curso
                </div>
                <div className="text-xs text-text-muted mt-0.5">
                  {format(parseISO(activeDraft.weekStart), "d 'de' MMM", { locale: pt })} –{' '}
                  {format(parseISO(activeDraft.weekEnd), "d 'de' MMM", { locale: pt })} · Fase {activeDraft.currentPhase} de 4
                </div>
              </div>
              <span className="text-xs text-accent font-medium shrink-0">Continuar →</span>
            </button>
          )}

          <div className="rounded-xl border border-border bg-bg-secondary p-5">
            <label className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Semana a rever
            </label>
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                onClick={() => shift(-7)}
                aria-label="Semana anterior"
                className="rounded-lg p-2 text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="text-center min-w-0 flex-1">
                <div className="text-base font-medium text-text-primary truncate">
                  {format(parseISO(weekStart), "d 'de' MMM", { locale: pt })} –{' '}
                  {format(parseISO(weekEnd), "d 'de' MMM yyyy", { locale: pt })}
                </div>
                <div className="text-xs text-text-muted mt-0.5">{targetWeekId}</div>
              </div>
              <button
                onClick={() => shift(7)}
                aria-label="Semana seguinte"
                className="rounded-lg p-2 text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="mt-3 flex gap-1.5 justify-center">
              <button
                onClick={() => setWeekStart(mondayOf(subDays(new Date(), 7)))}
                className="rounded-lg px-2.5 py-1 text-xs text-text-muted border border-border hover:bg-bg-hover hover:text-text-primary"
              >
                Semana passada
              </button>
              <button
                onClick={() => setWeekStart(mondayOf(new Date()))}
                className="rounded-lg px-2.5 py-1 text-xs text-text-muted border border-border hover:bg-bg-hover hover:text-text-primary"
              >
                Esta semana
              </button>
            </div>
          </div>

          {draftIsForOtherWeek && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Tens uma revisão por terminar de{' '}
              <strong>{activeDraft.week}</strong>. Termina-a antes de começar outra, ou{' '}
              <button
                onClick={() => discardDraft(activeDraft.week)}
                className="underline hover:text-amber-900"
              >
                descarta o rascunho
              </button>
              .
            </div>
          )}

          <button
            onClick={handleStart}
            disabled={!!draftIsForOtherWeek}
            className="mt-6 w-full rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Começar revisão
          </button>
        </div>
      </div>
    </div>
  )
}
