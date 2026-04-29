import { lazy, Suspense, useMemo } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import type { WeeklyReview } from '../../stores/weeklyReviewStore'

const WeeklyPlanningView = lazy(() => import('../../views/WeeklyPlanningView'))

interface Props {
  review: WeeklyReview
}

export default function PlanPhase({ review }: Props) {
  const nextMonday = useMemo(
    () => format(addDays(parseISO(review.weekEnd), 1), 'yyyy-MM-dd'),
    [review.weekEnd]
  )

  return (
    <div className="h-full">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <div className="text-sm text-text-muted">A carregar planeamento…</div>
          </div>
        }
      >
        <WeeklyPlanningView weekStart={nextMonday} embedded />
      </Suspense>
    </div>
  )
}
