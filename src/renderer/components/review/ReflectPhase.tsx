import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { pt } from 'date-fns/locale'
import { CheckCircle2, Circle, Layers } from 'lucide-react'
import type { WeeklyReview } from '../../stores/weeklyReviewStore'
import { useWeeklyReviewStore } from '../../stores/weeklyReviewStore'
import { useTimeBlockStore } from '../../stores/timeBlockStore'
import { getCompletedTaskItems, getMigrationItems } from '../../services/weekStats'
import ReflectField from './ReflectField'

interface Props {
  review: WeeklyReview
}

interface RecapEntry {
  taskId: string
  date: string
  blockId: string | null
  title: string
}

interface RecapGroup {
  date: string
  blocks: Array<[string | null, RecapEntry[]]>
}

function buildGroups(
  entries: RecapEntry[],
  blockTitleFor: (date: string, blockId: string | null) => string | null
): RecapGroup[] {
  const byDate = new Map<string, Map<string | null, RecapEntry[]>>()
  for (const e of entries) {
    const dm = byDate.get(e.date) ?? new Map<string | null, RecapEntry[]>()
    const list = dm.get(e.blockId) ?? []
    list.push(e)
    dm.set(e.blockId, list)
    byDate.set(e.date, dm)
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, blockMap]) => ({
      date,
      blocks: Array.from(blockMap.entries()).sort(([a], [b]) => {
        if (a === null) return -1
        if (b === null) return 1
        const ta = blockTitleFor(date, a) ?? ''
        const tb = blockTitleFor(date, b) ?? ''
        return ta < tb ? -1 : ta > tb ? 1 : 0
      })
    }))
}

interface RecapColumnProps {
  title: string
  count: number
  groups: RecapGroup[]
  blockTitleFor: (date: string, blockId: string | null) => string | null
  emptyText: string
  variant: 'done' | 'pending'
}

function RecapColumn({ title, count, groups, blockTitleFor, emptyText, variant }: RecapColumnProps) {
  const Icon = variant === 'done' ? CheckCircle2 : Circle
  const iconColor = variant === 'done' ? 'text-emerald-600' : 'text-text-muted'

  return (
    <div className="rounded-xl border border-border bg-bg-secondary/50 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="text-xs font-medium uppercase tracking-wider text-text-muted">{title}</div>
        <div className="text-xs font-medium text-text-secondary tabular-nums">{count}</div>
      </div>
      {groups.length === 0 ? (
        <div className="px-3 py-4 text-xs text-text-muted text-center">{emptyText}</div>
      ) : (
        <div className="max-h-72 overflow-y-auto px-3 py-2 space-y-3">
          {groups.map(({ date, blocks }) => (
            <div key={date}>
              <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted mb-1">
                {format(parseISO(date), 'EEE, d MMM', { locale: pt })}
              </div>
              <div className="space-y-2">
                {blocks.map(([blockId, items]) => {
                  const blockTitle = blockTitleFor(date, blockId)
                  return (
                    <div key={blockId ?? 'standalone'}>
                      {blockTitle && (
                        <div className="flex items-center gap-1 mb-0.5 text-[10px] text-text-muted">
                          <Layers size={9} />
                          <span className="font-medium truncate">{blockTitle}</span>
                        </div>
                      )}
                      <ul className="space-y-0.5">
                        {items.map((it) => (
                          <li key={it.taskId} className="flex items-start gap-1.5 text-xs">
                            <Icon size={11} className={`shrink-0 mt-0.5 ${iconColor}`} />
                            <span className="text-text-primary leading-snug">{it.title}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ReflectPhase({ review }: Props) {
  const setReflectField = useWeeklyReviewStore((s) => s.setReflectField)
  const blocksByDate = useTimeBlockStore((s) => s.blocks)

  const blockTitleFor = useMemo(() => {
    return (date: string, blockId: string | null): string | null => {
      if (!blockId) return null
      const block = blocksByDate[date]?.find((b) => b.id === blockId)
      return block?.title?.trim() || 'Bloco sem título'
    }
  }, [blocksByDate])

  const completed = useMemo(() => {
    const items = getCompletedTaskItems(review.weekStart, review.weekEnd)
    return items.map((it) => ({
      taskId: it.taskId,
      date: it.date,
      blockId: it.blockId,
      title: it.title
    }))
  }, [review.weekStart, review.weekEnd])

  const pending = useMemo(() => {
    const items = getMigrationItems(review.weekStart, review.weekEnd)
    return items.map((it) => ({
      taskId: it.taskId,
      date: it.originDate,
      blockId: it.blockId,
      title: it.titleSnapshot
    }))
  }, [review.weekStart, review.weekEnd])

  const completedGroups = useMemo(
    () => buildGroups(completed, blockTitleFor),
    [completed, blockTitleFor]
  )
  const pendingGroups = useMemo(
    () => buildGroups(pending, blockTitleFor),
    [pending, blockTitleFor]
  )

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-base font-medium text-text-primary mb-1">Reflectir</h2>
        <p className="text-sm text-text-muted mb-5">
          Olha primeiro para a semana, depois responde com calma.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <RecapColumn
            title="Realizado"
            count={completed.length}
            groups={completedGroups}
            blockTitleFor={blockTitleFor}
            emptyText="Nada concluído nesta semana."
            variant="done"
          />
          <RecapColumn
            title="Por fechar"
            count={pending.length}
            groups={pendingGroups}
            blockTitleFor={blockTitleFor}
            emptyText="Tudo o que abriu, fechou."
            variant="pending"
          />
        </div>

        <div className="space-y-5">
          <ReflectField
            label="Destaque"
            hint="O que correu melhor nesta semana?"
            value={review.reflectHighlight}
            onChange={(t) => setReflectField(review.week, 'highlight', t)}
          />
          <ReflectField
            label="Obstáculo"
            hint="O que te travou ou custou mais?"
            value={review.reflectObstacle}
            onChange={(t) => setReflectField(review.week, 'obstacle', t)}
          />
          <ReflectField
            label="Intenção"
            hint="Que intenção levas para a próxima semana?"
            value={review.reflectIntention}
            onChange={(t) => setReflectField(review.week, 'intention', t)}
          />
        </div>
      </div>
    </div>
  )
}
