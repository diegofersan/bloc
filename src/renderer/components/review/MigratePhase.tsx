import { useMemo } from 'react'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { pt } from 'date-fns/locale'
import { ArrowRight, X, Pause, CheckCircle2, Layers } from 'lucide-react'
import type { WeeklyReview, MigrationDecision } from '../../stores/weeklyReviewStore'
import { useWeeklyReviewStore } from '../../stores/weeklyReviewStore'
import { useTaskStore, type PendingHit } from '../../stores/taskStore'
import { useTimeBlockStore } from '../../stores/timeBlockStore'

interface Props {
  review: WeeklyReview
}

const DECISION_LABELS: Record<MigrationDecision, string> = {
  'next-week': 'Mover',
  keep: 'Manter',
  discard: 'Descartar'
}

interface DecisionButtonProps {
  decision: MigrationDecision
  active: boolean
  onClick: () => void
  size?: 'sm' | 'md'
}

function DecisionButton({ decision, active, onClick, size = 'sm' }: DecisionButtonProps) {
  const Icon = decision === 'next-week' ? ArrowRight : decision === 'keep' ? Pause : X
  const activeClass =
    decision === 'next-week'
      ? 'bg-accent text-white border-accent'
      : decision === 'keep'
        ? 'bg-bg-hover text-text-primary border-border'
        : 'bg-red-50 text-red-700 border-red-200'

  const padding = size === 'md' ? 'px-2.5 py-1' : 'px-2 py-1'
  const iconSize = size === 'md' ? 12 : 11

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-md border ${padding} text-xs transition-colors ${
        active
          ? activeClass
          : 'border-transparent text-text-muted hover:bg-bg-hover hover:text-text-secondary'
      }`}
    >
      <Icon size={iconSize} />
      {DECISION_LABELS[decision]}
    </button>
  )
}

function relativeDateLabel(originDate: string, today: Date): string {
  const d = parseISO(originDate)
  const days = differenceInCalendarDays(today, d)
  if (days === 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 7) return `há ${days} dias`
  if (days < 14) return 'há 1 semana'
  if (days < 28) return `há ${Math.floor(days / 7)} semanas`
  if (days < 60) return 'há ~1 mês'
  return `há ${Math.floor(days / 30)} meses`
}

export default function MigratePhase({ review }: Props) {
  const setMigrationDecision = useWeeklyReviewStore((s) => s.setMigrationDecision)
  const applyMassDecision = useWeeklyReviewStore((s) => s.applyMassDecision)
  const tasks = useTaskStore((s) => s.tasks)
  const getPendingByBlock = useTaskStore((s) => s.getPendingByBlock)
  const groups = useMemo(() => getPendingByBlock(), [tasks, getPendingByBlock])
  const blocksByDate = useTimeBlockStore((s) => s.blocks)

  const decisionMap = useMemo(() => {
    const map = new Map<string, MigrationDecision>()
    for (const m of review.migrations) map.set(m.taskId, m.decision)
    return map
  }, [review.migrations])

  const today = useMemo(() => new Date(), [])

  const totalCount = useMemo(
    () => groups.reduce((acc, g) => acc + g.items.length, 0),
    [groups]
  )

  // Resolve a friendly title for each group: look up the live block title
  // (groups[].title currently holds the raw blockId, per the store contract).
  function titleForGroup(blockId: string | null, items: PendingHit[]): string {
    if (!blockId) return 'Sem bloco'
    // Try the most recent originDate in the group — bloco lives on a date.
    for (const it of items) {
      const block = blocksByDate[it.originDate]?.find((b) => b.id === blockId)
      if (block?.title?.trim()) return block.title
    }
    return 'Bloco sem título'
  }

  if (totalCount === 0) {
    return (
      <div className="h-full overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-base font-medium text-text-primary mb-1">Migrar pendentes</h2>
          <p className="text-sm text-text-muted mb-6">
            Decide o destino do que ficou por fechar.
          </p>
          <div className="rounded-xl border border-border bg-bg-secondary p-6 text-center">
            <CheckCircle2 size={24} className="mx-auto text-text-muted mb-2" />
            <div className="text-sm text-text-primary">Não há tarefas em aberto.</div>
            <div className="text-xs text-text-muted mt-1">
              Tudo o que abriste, fechaste.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-base font-medium text-text-primary mb-1">Migrar pendentes</h2>
        <p className="text-sm text-text-muted mb-4">
          {totalCount === 1
            ? '1 tarefa em aberto.'
            : `${totalCount} tarefas em aberto`}
          {' '}— de toda a história, não só desta semana. Decide o destino — por defeito, tudo move para a próxima semana.
        </p>

        <div className="rounded-lg border border-border bg-bg-secondary p-3 mb-4 flex items-center justify-between">
          <div className="text-xs text-text-muted">Aplicar a todas:</div>
          <div className="flex gap-1">
            <button
              onClick={() => applyMassDecision(review.week, 'next-week')}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              <ArrowRight size={11} />
              Mover
            </button>
            <button
              onClick={() => applyMassDecision(review.week, 'keep')}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              <Pause size={11} />
              Manter
            </button>
            <button
              onClick={() => applyMassDecision(review.week, 'discard')}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-red-50 hover:text-red-700 hover:border-red-200"
            >
              <X size={11} />
              Descartar
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {groups.map((group) => {
            const title = titleForGroup(group.blockId, group.items)
            const taskIds = group.items.map((it) => it.task.id)

            // Group's effective decision: if all items share a decision, show it as active.
            const decisions = group.items.map((it) => decisionMap.get(it.task.id) ?? 'next-week')
            const allSame = decisions.every((d) => d === decisions[0])
            const groupDecision: MigrationDecision | null = allSame ? decisions[0] : null

            return (
              <div key={group.blockId ?? 'standalone'} className="rounded-xl border border-border overflow-hidden">
                <div className="flex items-center justify-between gap-3 bg-bg-secondary/60 px-3 py-2 border-b border-border">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Layers size={12} className="text-text-muted shrink-0" />
                    <span className="text-sm font-medium text-text-primary truncate">{title}</span>
                    <span className="text-xs text-text-muted tabular-nums shrink-0">
                      · {group.items.length}
                    </span>
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    <DecisionButton
                      decision="next-week"
                      active={groupDecision === 'next-week'}
                      onClick={() => applyMassDecision(review.week, 'next-week', taskIds)}
                      size="md"
                    />
                    <DecisionButton
                      decision="keep"
                      active={groupDecision === 'keep'}
                      onClick={() => applyMassDecision(review.week, 'keep', taskIds)}
                      size="md"
                    />
                    <DecisionButton
                      decision="discard"
                      active={groupDecision === 'discard'}
                      onClick={() => applyMassDecision(review.week, 'discard', taskIds)}
                      size="md"
                    />
                  </div>
                </div>

                <div>
                  {group.items.map((hit, idx) => {
                    const decision = decisionMap.get(hit.task.id) ?? 'next-week'
                    const dateLabel = format(parseISO(hit.originDate), 'd MMM', { locale: pt })
                    const relLabel = relativeDateLabel(hit.originDate, today)
                    return (
                      <div
                        key={hit.task.id}
                        className={`flex items-center gap-2 px-3 py-2 ${
                          idx > 0 ? 'border-t border-border' : ''
                        } ${decision === 'discard' ? 'opacity-60' : ''}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-sm truncate ${
                              decision === 'discard'
                                ? 'line-through text-text-muted'
                                : 'text-text-primary'
                            }`}
                          >
                            {hit.task.text}
                          </div>
                          <div className="text-[11px] text-text-muted mt-0.5 tabular-nums">
                            {dateLabel} · {relLabel}
                          </div>
                        </div>
                        <div className="flex gap-0.5 shrink-0">
                          <DecisionButton
                            decision="next-week"
                            active={decision === 'next-week'}
                            onClick={() =>
                              setMigrationDecision(review.week, hit.task.id, 'next-week')
                            }
                          />
                          <DecisionButton
                            decision="keep"
                            active={decision === 'keep'}
                            onClick={() => setMigrationDecision(review.week, hit.task.id, 'keep')}
                          />
                          <DecisionButton
                            decision="discard"
                            active={decision === 'discard'}
                            onClick={() =>
                              setMigrationDecision(review.week, hit.task.id, 'discard')
                            }
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
