import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  addMonths,
  subMonths
} from 'date-fns'
import { pt } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Settings, Inbox, ListTodo, Radar, CalendarDays } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTaskStore } from '../stores/taskStore'
import { usePomodoroStore } from '../stores/pomodoroStore'
import { useTimeBlockStore } from '../stores/timeBlockStore'

const WEEKDAYS_FULL = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'] as const
const WEEKDAYS_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const

export default function CalendarView() {
  const navigate = useNavigate()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [direction, setDirection] = useState(0)
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 640)

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const tasks = useTaskStore((s) => s.tasks)
  const distractions = useTaskStore((s) => s.distractions)
  const getPendingDistractionCount = useTaskStore((s) => s.getPendingDistractionCount)
  const getCompletedForDate = usePomodoroStore((s) => s.getCompletedForDate)
  const timeBlocks = useTimeBlockStore((s) => s.blocks)

  const pendingCount = getPendingDistractionCount()

  const datesWithTasks = useMemo(() => {
    return new Set(Object.keys(tasks).filter((d) => tasks[d].length > 0))
  }, [tasks])

  const datesWithDistractions = useMemo(() => {
    const dates: string[] = []
    for (const [date, list] of Object.entries(distractions)) {
      if (list.some((d) => d.status === 'pending')) {
        dates.push(date)
      }
    }
    return new Set(dates)
  }, [distractions])

  const datesWithTimeBlocks = useMemo(() => {
    return new Set(Object.keys(timeBlocks).filter((d) => timeBlocks[d].length > 0))
  }, [timeBlocks])

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [currentMonth])

  const goToPrevMonth = useCallback(() => {
    setDirection(-1)
    setCurrentMonth((m) => subMonths(m, 1))
  }, [])

  const goToNextMonth = useCallback(() => {
    setDirection(1)
    setCurrentMonth((m) => addMonths(m, 1))
  }, [])

  const goToToday = useCallback(() => {
    setDirection(0)
    setCurrentMonth(new Date())
  }, [])

  const handleDayClick = useCallback(
    (day: Date) => {
      navigate(`/day/${format(day, 'yyyy-MM-dd')}`)
    },
    [navigate]
  )

  const showTodayButton = !isSameMonth(currentMonth, new Date())

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 80 : -80,
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -80 : 80,
      opacity: 0
    })
  }

  const monthName = format(currentMonth, 'MMMM yyyy', { locale: pt })
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1)

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      {/* Titlebar drag area */}
      <div className={`titlebar-drag flex shrink-0 items-end justify-end pb-1 ${isNarrow ? 'px-3 pt-[38px]' : 'px-8 pt-[50px]'}`}>
        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={() => navigate('/week')}
            aria-label="Planeamento semanal"
            title="Planeamento semanal (⌘⇧W)"
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
          >
            <CalendarDays size={16} />
          </button>
          <button
            onClick={() => navigate('/inbox?tab=tasks')}
            aria-label="Todas as tarefas"
            title="⌘T"
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
          >
            <ListTodo size={16} />
          </button>
          <button
            onClick={() => navigate('/radar')}
            aria-label="Radar"
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
          >
            <Radar size={16} />
          </button>
          <button
            onClick={() => navigate('/inbox')}
            aria-label="Caixa de entrada"
            title="⌘I"
            className="relative rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
          >
            <Inbox size={16} />
            {pendingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-distraction text-white text-xs font-medium rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => navigate('/settings')}
            aria-label="Definições"
            title="⌘,"
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* App title */}
      <div className={`shrink-0 pb-1 ${isNarrow ? 'px-3' : 'px-8'}`}>
        <h1 className={`font-semibold text-text-primary ${isNarrow ? 'text-xl' : 'text-2xl'}`}>Bloc</h1>
      </div>

      {/* Month header */}
      <div className={`flex shrink-0 items-center justify-between pb-6 pt-2 ${isNarrow ? 'px-3' : 'px-8'}`}>
        <h2 className={`font-medium text-text-primary ${isNarrow ? 'text-base' : 'text-lg'}`}>
          {capitalizedMonth}
        </h2>
        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {showTodayButton && (
            <button
              onClick={goToToday}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
            >
              Hoje
            </button>
          )}
          <button
            onClick={goToPrevMonth}
            aria-label="Mês anterior"
            className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={goToNextMonth}
            aria-label="Mês seguinte"
            className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Calendar grid container */}
      <div className={`min-h-0 flex-1 pb-6 ${isNarrow ? 'px-3' : 'px-8'}`}>
        <div className="h-full rounded-xl border border-border overflow-hidden">
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 border-b border-border">
            {(isNarrow ? WEEKDAYS_SHORT : WEEKDAYS_FULL).map((day, i) => (
              <div
                key={i}
                className="py-3 text-center text-xs font-medium uppercase tracking-wider text-text-muted"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={format(currentMonth, 'yyyy-MM')}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="grid h-[calc(100%-41px)] grid-cols-7"
              style={{
                gridTemplateRows: `repeat(${Math.ceil(calendarDays.length / 7)}, minmax(0, 1fr))`
              }}
            >
              {calendarDays.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd')
                const inCurrentMonth = isSameMonth(day, currentMonth)
                const today = isToday(day)
                const hasTasks = datesWithTasks.has(dateStr)
                const hasDistractions = datesWithDistractions.has(dateStr)
                const hasTimeBlocks = datesWithTimeBlocks.has(dateStr)
                const pomodoroCount = getCompletedForDate(dateStr)

                return (
                  <button
                    key={dateStr}
                    onClick={() => handleDayClick(day)}
                    aria-label={format(day, "d 'de' MMMM yyyy", { locale: pt })}
                    aria-current={today ? 'date' : undefined}
                    className={`
                      group relative flex flex-col items-center justify-center
                      border-t border-border transition-colors
                      ${inCurrentMonth ? 'hover:bg-bg-hover' : 'hover:bg-bg-hover/50'}
                    `}
                  >
                    {today ? (
                      <span className={`bg-accent text-white rounded-full flex items-center justify-center font-semibold ${isNarrow ? 'w-6 h-6 text-xs' : 'w-7 h-7 text-sm'}`}>
                        {format(day, 'd')}
                      </span>
                    ) : (
                      <span
                        className={`
                          text-sm
                          ${inCurrentMonth ? 'font-medium text-text-primary' : 'text-text-muted'}
                        `}
                      >
                        {format(day, 'd')}
                      </span>
                    )}
                    {(hasTasks || hasDistractions || hasTimeBlocks) && (
                      <div className="flex gap-0.5 mt-1">
                        {hasTimeBlocks && <div className="h-1.5 w-1.5 rounded-full bg-accent" />}
                        {hasTasks && <div className="h-1.5 w-1.5 rounded-full bg-success" />}
                        {hasDistractions && <div className="h-1.5 w-1.5 rounded-full bg-distraction" />}
                      </div>
                    )}
                    {!isNarrow && pomodoroCount > 0 && (
                      <div className="flex gap-[2px] mt-0.5">
                        {Array.from({ length: Math.min(pomodoroCount, 8) }).map((_, i) => (
                          <div key={i} className="w-[2px] h-[6px] rounded-full bg-accent/30" />
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
