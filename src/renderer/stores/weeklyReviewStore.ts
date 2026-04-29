import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { addDays, format, parseISO } from 'date-fns'
import { getISOWeekId, getWeekEndFromStart } from '../utils/weekId'
import { useTaskStore } from './taskStore'
import { useTimeBlockStore } from './timeBlockStore'

export type ReviewPhase = 1 | 2 | 3 | 4
export type ReviewStatus = 'draft' | 'sealed'
export type MigrationDecision = 'next-week' | 'keep' | 'discard'
export type ReflectField = 'highlight' | 'obstacle' | 'intention'

export interface MigrationDecisionEntry {
  taskId: string
  originDate: string  // may be a storeKey (date or date__block__id)
  titleSnapshot: string
  decision: MigrationDecision
}

export interface WeeklyReview {
  week: string
  weekStart: string
  weekEnd: string
  status: ReviewStatus
  currentPhase: ReviewPhase
  migrations: MigrationDecisionEntry[]
  reflectHighlight: string
  reflectObstacle: string
  reflectIntention: string
  createdAt: number
  updatedAt: number
  sealedAt?: number
}

interface ApplyResult {
  moved: number
  kept: number
  discarded: number
}

interface WeeklyReviewState {
  reviews: Record<string, WeeklyReview>  // by week id
  activeWeek: string | null

  loadReview: (week: string) => Promise<WeeklyReview | null>
  startReview: (weekStart: string) => WeeklyReview
  setPhase: (week: string, phase: ReviewPhase) => void
  setMigrationDecision: (week: string, taskId: string, decision: MigrationDecision) => void
  applyMassDecision: (week: string, decision: MigrationDecision, taskIds?: string[]) => void
  setReflectField: (week: string, field: ReflectField, text: string) => void
  applyMigration: (week: string) => ApplyResult
  seal: (week: string) => void
  discardDraft: (week: string) => void
  getActiveDraft: () => WeeklyReview | null
}

const writeTimers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleWrite(review: WeeklyReview): void {
  const existing = writeTimers.get(review.week)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    writeTimers.delete(review.week)
    void window.bloc?.icloud.writeReview(review)
  }, 300)
  writeTimers.set(review.week, timer)
}

function flushWrite(review: WeeklyReview): void {
  const existing = writeTimers.get(review.week)
  if (existing) clearTimeout(existing)
  writeTimers.delete(review.week)
  void window.bloc?.icloud.writeReview(review)
}

function buildEmptyReview(weekStart: string): WeeklyReview {
  const weekEnd = getWeekEndFromStart(weekStart)
  const week = getISOWeekId(weekStart)
  const now = Date.now()
  return {
    week,
    weekStart,
    weekEnd,
    status: 'draft',
    currentPhase: 1,
    migrations: [],
    reflectHighlight: '',
    reflectObstacle: '',
    reflectIntention: '',
    createdAt: now,
    updatedAt: now
  }
}

function touch(review: WeeklyReview): WeeklyReview {
  return { ...review, updatedAt: Date.now() }
}

function findPendingHit(taskId: string): {
  storeKey: string
  originDate: string
  blockId: string | null
  titleSnapshot: string
} | null {
  const groups = useTaskStore.getState().getPendingByBlock()
  for (const g of groups) {
    for (const h of g.items) {
      if (h.task.id === taskId) {
        return {
          storeKey: h.storeKey,
          originDate: h.originDate,
          blockId: h.blockId,
          titleSnapshot: h.task.text
        }
      }
    }
  }
  return null
}

/**
 * Compute the date in the target week (starting at `nextWeekMonday`) that has
 * the same ISO weekday as `originDate`. Mon=0..Sun=6.
 */
function sameWeekdayOf(originDate: string, nextWeekMonday: string): string {
  const origin = parseISO(originDate)
  const isoWeekday = (origin.getDay() + 6) % 7
  return format(addDays(parseISO(nextWeekMonday), isoWeekday), 'yyyy-MM-dd')
}

export const useWeeklyReviewStore = create<WeeklyReviewState>()(
  persist(
    (set, get) => ({
      reviews: {},
      activeWeek: null,

      loadReview: async (week) => {
        const cached = get().reviews[week]
        const remote = (await window.bloc?.icloud.readReview(week)) as WeeklyReview | null | undefined
        if (remote) {
          set((s) => ({ reviews: { ...s.reviews, [week]: remote } }))
          return remote
        }
        return cached ?? null
      },

      startReview: (weekStart) => {
        const review = buildEmptyReview(weekStart)
        set((s) => ({
          reviews: { ...s.reviews, [review.week]: review },
          activeWeek: review.status === 'draft' ? review.week : s.activeWeek
        }))
        flushWrite(review)
        return review
      },

      setPhase: (week, phase) => {
        const review = get().reviews[week]
        if (!review || review.status === 'sealed') return
        const updated = touch({ ...review, currentPhase: phase })
        set((s) => ({ reviews: { ...s.reviews, [week]: updated } }))
        scheduleWrite(updated)
      },

      setMigrationDecision: (week, taskId, decision) => {
        const review = get().reviews[week]
        if (!review || review.status === 'sealed') return
        const idx = review.migrations.findIndex((m) => m.taskId === taskId)
        let migrations: MigrationDecisionEntry[]
        if (idx >= 0) {
          migrations = [...review.migrations]
          migrations[idx] = { ...migrations[idx], decision }
        } else {
          const hit = findPendingHit(taskId)
          if (!hit) return
          migrations = [
            ...review.migrations,
            {
              taskId,
              originDate: hit.storeKey,
              titleSnapshot: hit.titleSnapshot,
              decision
            }
          ]
        }
        const updated = touch({ ...review, migrations })
        set((s) => ({ reviews: { ...s.reviews, [week]: updated } }))
        scheduleWrite(updated)
      },

      applyMassDecision: (week, decision, taskIds) => {
        const review = get().reviews[week]
        if (!review || review.status === 'sealed') return

        const groups = useTaskStore.getState().getPendingByBlock()
        const flat = groups.flatMap((g) => g.items)
        const targets = taskIds
          ? flat.filter((h) => taskIds.includes(h.task.id))
          : flat

        const map = new Map(review.migrations.map((m) => [m.taskId, m]))
        for (const h of targets) {
          map.set(h.task.id, {
            taskId: h.task.id,
            originDate: h.storeKey,
            titleSnapshot: h.task.text,
            decision
          })
        }
        const migrations = [...map.values()]
        const updated = touch({ ...review, migrations })
        set((s) => ({ reviews: { ...s.reviews, [week]: updated } }))
        scheduleWrite(updated)
      },

      setReflectField: (week, field, text) => {
        const review = get().reviews[week]
        if (!review || review.status === 'sealed') return
        const next: WeeklyReview = { ...review }
        if (field === 'highlight') next.reflectHighlight = text
        else if (field === 'obstacle') next.reflectObstacle = text
        else next.reflectIntention = text
        const updated = touch(next)
        set((s) => ({ reviews: { ...s.reviews, [week]: updated } }))
        scheduleWrite(updated)
      },

      applyMigration: (week) => {
        const review = get().reviews[week]
        if (!review) return { moved: 0, kept: 0, discarded: 0 }

        const taskState = useTaskStore.getState()
        const blockState = useTimeBlockStore.getState()

        // Source of truth = current pending list, not the snapshot.
        // Decisions overlay; default is 'next-week'.
        const groups = taskState.getPendingByBlock()
        const flat = groups.flatMap((g) => g.items)
        const decisionMap = new Map(review.migrations.map((m) => [m.taskId, m.decision]))

        const nextWeekMonday = format(addDays(parseISO(review.weekEnd), 1), 'yyyy-MM-dd')
        const movePlan: { originDate: string; taskId: string; targetDate: string }[] = []
        // Cache: `<originDate>__<originBlockId>` → newBlockId in target week.
        const blockMap = new Map<string, string>()

        let moved = 0
        let kept = 0
        let discarded = 0

        for (const hit of flat) {
          const decision = decisionMap.get(hit.task.id) ?? 'next-week'

          if (decision === 'keep') {
            kept++
            continue
          }
          if (decision === 'discard') {
            taskState.markWontDo(hit.storeKey, hit.task.id)
            discarded++
            continue
          }

          // 'next-week' — copy as ref into W+1
          const targetDate = sameWeekdayOf(hit.originDate, nextWeekMonday)

          if (hit.blockId) {
            const cacheKey = `${hit.originDate}__${hit.blockId}`
            let targetBlockId = blockMap.get(cacheKey)
            if (!targetBlockId) {
              const originBlock = blockState.blocks[hit.originDate]?.find(
                (b) => b.id === hit.blockId
              )
              if (originBlock) {
                targetBlockId = blockState.addBlock(targetDate, {
                  date: targetDate,
                  title: originBlock.title,
                  startTime: originBlock.startTime,
                  endTime: originBlock.endTime,
                  color: originBlock.color
                })
                blockMap.set(cacheKey, targetBlockId)
              }
            }
            if (targetBlockId) {
              movePlan.push({
                originDate: hit.storeKey,
                taskId: hit.task.id,
                targetDate: `${targetDate}__block__${targetBlockId}`
              })
            } else {
              // Origin block disappeared — degrade to standalone
              movePlan.push({
                originDate: hit.storeKey,
                taskId: hit.task.id,
                targetDate
              })
            }
          } else {
            movePlan.push({
              originDate: hit.storeKey,
              taskId: hit.task.id,
              targetDate
            })
          }
          moved++
        }

        if (movePlan.length > 0) taskState.distributeTasks(movePlan)

        return { moved, kept, discarded }
      },

      seal: (week) => {
        const review = get().reviews[week]
        if (!review || review.status === 'sealed') return
        const sealed = touch({ ...review, status: 'sealed' as ReviewStatus, sealedAt: Date.now() })
        set((s) => ({
          reviews: { ...s.reviews, [week]: sealed },
          activeWeek: s.activeWeek === week ? null : s.activeWeek
        }))
        flushWrite(sealed)
      },

      discardDraft: (week) => {
        set((s) => {
          const next = { ...s.reviews }
          delete next[week]
          return {
            reviews: next,
            activeWeek: s.activeWeek === week ? null : s.activeWeek
          }
        })
      },

      getActiveDraft: () => {
        const { activeWeek, reviews } = get()
        if (!activeWeek) return null
        const review = reviews[activeWeek]
        if (!review || review.status !== 'draft') return null
        return review
      }
    }),
    {
      name: 'bloc-weekly-reviews',
      version: 1
    }
  )
)
