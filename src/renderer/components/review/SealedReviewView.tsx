import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { pt } from 'date-fns/locale'
import { ArrowLeft, Lock, CheckCircle2, Circle, Calendar, Coffee, Activity, AlertTriangle } from 'lucide-react'
import type { WeeklyReview } from '../../stores/weeklyReviewStore'
import { computeWeekStats } from '../../services/weekStats'
import ReflectField from './ReflectField'

interface Props {
  review: WeeklyReview
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  hint?: string
}

function StatCard({ icon, label, value, hint }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-bg-secondary p-4">
      <div className="flex items-center gap-2 text-text-muted">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-text-primary tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-text-muted">{hint}</div>}
    </div>
  )
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export default function SealedReviewView({ review }: Props) {
  const navigate = useNavigate()
  const stats = useMemo(
    () => computeWeekStats(review.weekStart, review.weekEnd),
    [review.weekStart, review.weekEnd]
  )

  const completionPct = Math.round(stats.completionRate * 100)
  const sealedAt = review.sealedAt ? new Date(review.sealedAt) : null
  const moved = review.migrations.filter((m) => m.decision === 'next-week').length
  const kept = review.migrations.filter((m) => m.decision === 'keep').length
  const discarded = review.migrations.filter((m) => m.decision === 'discard').length

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
          {sealedAt && (
            <div className="text-xs text-text-muted mt-0.5">
              Selada {format(sealedAt, "d 'de' MMM 'às' HH:mm", { locale: pt })}
            </div>
          )}
        </div>
        <div
          className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border bg-bg-secondary px-2.5 py-1 text-xs text-text-muted"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <Lock size={11} />
          Selada
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-8">
          <section>
            <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">
              Recuar
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard
                icon={<CheckCircle2 size={14} />}
                label="Tarefas feitas"
                value={stats.completedTasks}
                hint={`${completionPct}% de ${stats.totalTasks}`}
              />
              <StatCard
                icon={<Circle size={14} />}
                label="Pendentes"
                value={stats.pendingTasks}
              />
              <StatCard
                icon={<Calendar size={14} />}
                label="Blocos"
                value={stats.totalBlocks}
                hint={formatMinutes(stats.totalBlockMinutes)}
              />
              <StatCard
                icon={<Coffee size={14} />}
                label="Pomodoros"
                value={stats.totalPomodoros}
              />
              <StatCard
                icon={<AlertTriangle size={14} />}
                label="Distrações"
                value={stats.totalDistractions}
              />
              <StatCard
                icon={<Activity size={14} />}
                label="Dias activos"
                value={`${stats.daysWithActivity}/7`}
              />
            </div>
          </section>

          {review.migrations.length > 0 && (
            <section>
              <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">
                Migração
              </h2>
              <div className="rounded-xl border border-border bg-bg-secondary p-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-xl font-semibold text-text-primary tabular-nums">
                      {moved}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">movidas</div>
                  </div>
                  <div>
                    <div className="text-xl font-semibold text-text-primary tabular-nums">
                      {kept}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">mantidas</div>
                  </div>
                  <div>
                    <div className="text-xl font-semibold text-text-primary tabular-nums">
                      {discarded}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">descartadas</div>
                  </div>
                </div>
              </div>
            </section>
          )}

          <section>
            <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">
              Reflexão
            </h2>
            <div className="space-y-5">
              <ReflectField
                label="Destaque"
                hint="O que correu melhor"
                value={review.reflectHighlight}
                onChange={() => {}}
                readOnly
              />
              <ReflectField
                label="Obstáculo"
                hint="O que travou"
                value={review.reflectObstacle}
                onChange={() => {}}
                readOnly
              />
              <ReflectField
                label="Intenção"
                hint="Para a próxima"
                value={review.reflectIntention}
                onChange={() => {}}
                readOnly
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
