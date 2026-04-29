import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format, startOfWeek, subDays } from 'date-fns'
import { useWeeklyReviewStore } from '../../stores/weeklyReviewStore'
import { getISOWeekId, getWeekStartFromId } from '../../utils/weekId'
import WeekSelector from './WeekSelector'
import ReviewWizard from './ReviewWizard'
import SealedReviewView from './SealedReviewView'

function defaultWeekStart(): string {
  const lastWeekDay = subDays(new Date(), 7)
  const monday = startOfWeek(lastWeekDay, { weekStartsOn: 1 })
  return format(monday, 'yyyy-MM-dd')
}

export default function ReviewView() {
  const navigate = useNavigate()
  const { week: weekParam } = useParams<{ week?: string }>()
  const reviews = useWeeklyReviewStore((s) => s.reviews)
  const activeWeek = useWeeklyReviewStore((s) => s.activeWeek)
  const loadReview = useWeeklyReviewStore((s) => s.loadReview)
  const [loading, setLoading] = useState(true)

  const targetWeek = weekParam ?? activeWeek ?? null
  const review = targetWeek ? reviews[targetWeek] : null

  useEffect(() => {
    let cancelled = false
    if (!targetWeek) {
      setLoading(false)
      return
    }
    setLoading(true)
    loadReview(targetWeek).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [targetWeek, loadReview])

  if (!targetWeek) {
    return (
      <WeekSelector
        defaultWeekStart={defaultWeekStart()}
        onPicked={(weekStart) => {
          const week = getISOWeekId(weekStart)
          navigate(`/review/${week}`)
        }}
      />
    )
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-primary">
        <div className="text-sm text-text-muted">A carregar revisão…</div>
      </div>
    )
  }

  if (!review) {
    const monday = (() => {
      try { return getWeekStartFromId(targetWeek) }
      catch { return defaultWeekStart() }
    })()
    return (
      <WeekSelector
        defaultWeekStart={monday}
        onPicked={(weekStart) => {
          const week = getISOWeekId(weekStart)
          navigate(`/review/${week}`, { replace: true })
        }}
      />
    )
  }

  if (review.status === 'sealed') {
    return <SealedReviewView review={review} />
  }

  return <ReviewWizard review={review} />
}
