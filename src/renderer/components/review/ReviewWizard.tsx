import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { pt } from 'date-fns/locale'
import { ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react'
import type { WeeklyReview, ReviewPhase } from '../../stores/weeklyReviewStore'
import { useWeeklyReviewStore } from '../../stores/weeklyReviewStore'
import LookBackPhase from './LookBackPhase'
import MigratePhase from './MigratePhase'
import ReflectPhase from './ReflectPhase'
import PlanPhase from './PlanPhase'

const PHASE_LABELS: Record<ReviewPhase, string> = {
  1: 'Recuar',
  2: 'Migrar',
  3: 'Reflectir',
  4: 'Planear'
}

interface Props {
  review: WeeklyReview
}

export default function ReviewWizard({ review }: Props) {
  const navigate = useNavigate()
  const setPhase = useWeeklyReviewStore((s) => s.setPhase)
  const applyMigration = useWeeklyReviewStore((s) => s.applyMigration)
  const seal = useWeeklyReviewStore((s) => s.seal)
  const [confirmingSeal, setConfirmingSeal] = useState(false)
  const phase = review.currentPhase

  function handleSeal() {
    seal(review.week)
    navigate('/')
  }

  function advanceFrom(current: ReviewPhase) {
    if (current >= 4) return
    if (current === 2) applyMigration(review.week)
    setPhase(review.week, (current + 1) as ReviewPhase)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.key === 'ArrowLeft' && phase > 1) {
        e.preventDefault()
        setPhase(review.week, (phase - 1) as ReviewPhase)
      } else if (e.key === 'ArrowRight' && phase < 4) {
        e.preventDefault()
        advanceFrom(phase)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, review.week, setPhase])

  function handlePrev() {
    if (phase > 1) setPhase(review.week, (phase - 1) as ReviewPhase)
  }

  function handleNext() {
    advanceFrom(phase)
  }

  return (
    <div className="flex h-full flex-col bg-bg-primary">
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

      <div className="shrink-0 px-6 py-3 flex items-center justify-between gap-3 border-b border-border">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-text-primary truncate">
            Revisão de {format(parseISO(review.weekStart), "d 'de' MMM", { locale: pt })} –{' '}
            {format(parseISO(review.weekEnd), "d 'de' MMM", { locale: pt })}
          </h1>
          <div className="text-xs text-text-muted mt-0.5">
            Fase {phase} de 4 · {PHASE_LABELS[phase]}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {([1, 2, 3, 4] as ReviewPhase[]).map((p) => (
            <button
              key={p}
              onClick={() => setPhase(review.week, p)}
              aria-label={`Fase ${p}: ${PHASE_LABELS[p]}`}
              className={`h-1.5 rounded-full transition-all ${
                p === phase
                  ? 'bg-accent w-8'
                  : p < phase
                    ? 'bg-accent/40 w-4 hover:bg-accent/60'
                    : 'bg-border w-4 hover:bg-text-muted/30'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {phase === 1 && <LookBackPhase review={review} />}
        {phase === 2 && <MigratePhase review={review} />}
        {phase === 3 && <ReflectPhase review={review} />}
        {phase === 4 && <PlanPhase review={review} />}
      </div>

      <div className="shrink-0 px-6 py-3 border-t border-border flex items-center justify-between">
        <button
          onClick={handlePrev}
          disabled={phase === 1}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
        >
          <ChevronLeft size={14} />
          Anterior
        </button>
        {phase < 4 ? (
          <button
            onClick={handleNext}
            className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
          >
            Avançar
            <ChevronRight size={14} />
          </button>
        ) : confirmingSeal ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary">Selar a revisão?</span>
            <button
              onClick={() => setConfirmingSeal(false)}
              className="rounded-lg px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover"
            >
              Cancelar
            </button>
            <button
              onClick={handleSeal}
              className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
            >
              <CheckCircle2 size={12} />
              Selar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingSeal(true)}
            className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
          >
            <CheckCircle2 size={14} />
            Concluir revisão
          </button>
        )}
      </div>
    </div>
  )
}
