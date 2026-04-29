import { useMemo } from 'react'
import { CheckCircle2, Circle, Calendar, Coffee, Activity, AlertTriangle } from 'lucide-react'
import type { WeeklyReview } from '../../stores/weeklyReviewStore'
import { computeWeekStats } from '../../services/weekStats'

interface Props {
  review: WeeklyReview
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  hint?: string
  emphasis?: boolean
}

function StatCard({ icon, label, value, hint, emphasis }: StatCardProps) {
  return (
    <div className={`rounded-xl border p-4 ${emphasis ? 'border-accent/30 bg-accent/5' : 'border-border bg-bg-secondary'}`}>
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

export default function LookBackPhase({ review }: Props) {
  const stats = useMemo(
    () => computeWeekStats(review.weekStart, review.weekEnd),
    [review.weekStart, review.weekEnd]
  )

  const completionPct = Math.round(stats.completionRate * 100)
  const hasActivity = stats.daysWithActivity > 0

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-base font-medium text-text-primary mb-1">Como correu a semana?</h2>
        <p className="text-sm text-text-muted mb-6">
          Antes de qualquer decisão, observa. Os números abaixo são o reflexo do que aconteceu.
        </p>

        {!hasActivity ? (
          <div className="rounded-xl border border-border bg-bg-secondary p-6 text-center">
            <div className="text-sm text-text-muted">
              Esta semana não tem actividade registada. Não há nada para observar.
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard
                icon={<CheckCircle2 size={14} />}
                label="Tarefas feitas"
                value={stats.completedTasks}
                hint={`${completionPct}% de ${stats.totalTasks}`}
                emphasis
              />
              <StatCard
                icon={<Circle size={14} />}
                label="Pendentes"
                value={stats.pendingTasks}
                hint={stats.pendingTasks > 0 ? 'A migrar na próxima fase' : 'Tudo fechado'}
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

            {stats.pendingTasks > 0 && (
              <div className="mt-6 rounded-xl border border-border bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
                Tens <strong className="text-text-primary">{stats.pendingTasks}</strong> tarefa
                {stats.pendingTasks === 1 ? '' : 's'} por decidir na próxima fase.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
