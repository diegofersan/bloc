import { useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useTaskStore, type PendingHit } from '../../stores/taskStore'
import { useTimeBlockStore, type TimeBlock, type TimeBlockColor } from '../../stores/timeBlockStore'
import { useWeeklyPlanningUiStore } from '../../stores/weeklyPlanningUiStore'

interface Props {
  /** Visible week dates — pendings whose origin or refs land in this window are hidden. */
  weekDates?: string[]
}

const BLOCK_HEX: Record<TimeBlockColor, string> = {
  indigo: '#6366f1',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  sky: '#0ea5e9',
  violet: '#8b5cf6',
  slate: '#64748b'
}

function ageLabel(addedAt: number, now: number): string {
  const days = Math.floor((now - addedAt) / (24 * 60 * 60 * 1000))
  if (days < 1) return 'hoje'
  return `${days}d`
}

function resolveBlockMeta(
  blockId: string | null,
  blocksByDate: Record<string, TimeBlock[]>
): { title: string; color: TimeBlockColor; isUndefined: boolean } {
  if (!blockId) return { title: 'Bloco indefinido', color: 'slate', isUndefined: true }
  for (const list of Object.values(blocksByDate)) {
    const m = list.find((b) => b.id === blockId)
    if (m) return { title: m.title || 'Sem título', color: m.color, isUndefined: false }
  }
  return { title: blockId, color: 'slate', isUndefined: false }
}

export default function PendingPanel({ weekDates }: Props) {
  const getPendingByBlock = useTaskStore((s) => s.getPendingByBlock)
  const taskRefs = useTaskStore((s) => s.taskRefs)
  const blocks = useTimeBlockStore((s) => s.blocks)
  const collapsedGroups = useWeeklyPlanningUiStore((s) => s.collapsedGroups)
  const toggleGroup = useWeeklyPlanningUiStore((s) => s.toggleGroupCollapsed)
  const startPendingDrag = useWeeklyPlanningUiStore((s) => s.startPendingDrag)
  const endDrag = useWeeklyPlanningUiStore((s) => s.endDrag)

  const groups = useMemo(() => {
    const raw = getPendingByBlock()
    if (!weekDates || weekDates.length === 0) return raw

    const weekSet = new Set(weekDates)
    // Build set of (origin::taskId) already referenced into the visible week.
    const referencedInWeek = new Set<string>()
    for (const d of weekDates) {
      const refs = taskRefs[d] ?? []
      for (const r of refs) referencedInWeek.add(`${r.originDate}::${r.originTaskId}`)
    }

    return raw
      .map((g) => ({
        ...g,
        items: g.items.filter((hit) => {
          // Origin already inside the visible week — implicitly scheduled.
          if (weekSet.has(hit.originDate)) return false
          // Already has a ref in the visible week.
          if (referencedInWeek.has(`${hit.originDate}::${hit.task.id}`)) return false
          return true
        })
      }))
      .filter((g) => g.items.length > 0)
  }, [getPendingByBlock, taskRefs, weekDates, blocks])

  const total = useMemo(() => groups.reduce((acc, g) => acc + g.items.length, 0), [groups])

  const now = Date.now()

  return (
    <div className="flex flex-col h-full min-h-0 border-l border-border bg-bg-secondary/50">
      <div className="shrink-0 px-3 py-3 border-b border-border">
        <div className="text-sm font-medium text-text-primary">Pendentes</div>
        <div className="text-[11px] text-text-muted">{total} {total === 1 ? 'tarefa' : 'tarefas'}</div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {total === 0 && (
          <div className="px-3 py-6 text-center text-xs text-text-muted">
            Sem pendentes
          </div>
        )}
        <div className="p-2 space-y-2">
          {groups.map((g) => {
            const groupKey = g.blockId ?? '__none__'
            const collapsed = collapsedGroups.includes(groupKey)
            const meta = resolveBlockMeta(g.blockId, blocks)
            const hex = BLOCK_HEX[meta.color]
            return (
              <div
                key={groupKey}
                className="rounded-lg overflow-hidden"
                style={{ backgroundColor: `${hex}1A` }}
              >
                <button
                  onClick={() => toggleGroup(groupKey)}
                  className="w-full flex items-center gap-1.5 px-2 pt-1.5 pb-1 text-left transition-colors hover:bg-black/5"
                >
                  {collapsed ? (
                    <ChevronRight size={11} style={{ color: hex }} />
                  ) : (
                    <ChevronDown size={11} style={{ color: hex }} />
                  )}
                  <div
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.isUndefined ? 'border border-dashed' : ''}`}
                    style={meta.isUndefined ? { borderColor: hex } : { backgroundColor: hex }}
                  />
                  <span
                    className="text-[11px] font-medium truncate flex-1"
                    style={{ color: hex }}
                  >
                    {meta.title}
                  </span>
                  <span className="text-[10px] text-text-muted shrink-0">{g.items.length}</span>
                </button>
                {!collapsed && (
                  <div className="px-1 pb-1 space-y-0">
                    {g.items.map((hit: PendingHit) => {
                      const est = hit.task.estimatedMinutes
                      return (
                        <div
                          key={`${hit.storeKey}::${hit.task.id}`}
                          draggable
                          onDragStart={() => startPendingDrag(hit.originDate, hit.task.id)}
                          onDragEnd={() => endDrag()}
                          className="px-2 py-1 rounded text-[12px] cursor-grab active:cursor-grabbing hover:bg-black/5 flex items-center gap-2"
                          title={hit.task.text}
                        >
                          <span className="flex-1 truncate text-text-primary">{hit.task.text}</span>
                          <span className="text-[10px] text-text-muted shrink-0">
                            {ageLabel(hit.task.createdAt, now)}
                            {est ? ` · ${est}m` : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
