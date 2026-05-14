import { useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  format,
  addDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  isWeekend,
  eachDayOfInterval,
  parseISO
} from 'date-fns'
import { pt } from 'date-fns/locale'
import { APP_OVERLAY_Z, portalToBody } from '../utils/bodyPortal'

interface DeferBlockModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectDate: (date: string) => void
  blockDate: string
}

export default function DeferBlockModal({ isOpen, onClose, onSelectDate, blockDate }: DeferBlockModalProps) {
  const today = useMemo(() => new Date(), [])
  const blockDateParsed = useMemo(() => parseISO(blockDate), [blockDate])

  // Build calendar days for current month and next month
  const months = useMemo(() => {
    const m1Start = startOfMonth(today)
    const m2Start = startOfMonth(addDays(endOfMonth(today), 1))
    return [m1Start, m2Start].map((monthStart) => {
      const monthEnd = endOfMonth(monthStart)
      const calStart = startOfWeek(monthStart, { locale: pt })
      const calEnd = endOfWeek(monthEnd, { locale: pt })
      const days = eachDayOfInterval({ start: calStart, end: calEnd })
      return { monthStart, days }
    })
  }, [today])

  // Escape to close
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, onClose])

  function handleSelectDate(date: Date) {
    const dateKey = format(date, 'yyyy-MM-dd')
    onSelectDate(dateKey)
    onClose()
  }

  const weekDays = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

  return portalToBody(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          role="dialog"
          aria-modal="true"
          aria-label="Adiar bloco"
          className={`fixed inset-0 ${APP_OVERLAY_Z} flex items-center justify-center bg-black/40 backdrop-blur-sm`}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-bg-secondary rounded-xl shadow-xl border border-border w-full max-w-md mx-4 p-5"
          >
            <h3 className="text-sm font-semibold text-text-primary mb-4">Adiar bloco</h3>

            <div className="space-y-4">
              {months.map(({ monthStart, days }) => (
                <div key={monthStart.toISOString()}>
                  <p className="text-xs font-medium text-text-secondary mb-2 capitalize">
                    {format(monthStart, 'MMMM yyyy', { locale: pt })}
                  </p>

                  <div className="grid grid-cols-7 gap-0.5">
                    {weekDays.map((d) => (
                      <div key={d} className="text-center text-[10px] text-text-muted uppercase pb-1">
                        {d}
                      </div>
                    ))}

                    {days.map((day) => {
                      const inMonth = isSameMonth(day, monthStart)
                      const isToday = isSameDay(day, today)
                      const isBlockDate = isSameDay(day, blockDateParsed)
                      const isPast = day < today && !isToday
                      const disabled = !inMonth || isBlockDate || isPast

                      const weekend = isWeekend(day)

                      return (
                        <button
                          key={day.toISOString()}
                          onClick={() => !disabled && handleSelectDate(day)}
                          disabled={disabled}
                          className={`
                            h-8 rounded-md text-xs transition-colors
                            ${!inMonth ? 'text-transparent cursor-default' : ''}
                            ${inMonth && disabled ? 'text-text-muted/40 cursor-not-allowed' : ''}
                            ${inMonth && !disabled && weekend ? 'text-text-muted hover:bg-bg-hover' : ''}
                            ${inMonth && !disabled && !weekend ? 'text-text-primary hover:bg-bg-hover' : ''}
                            ${isToday ? 'bg-accent/10 font-semibold text-accent' : ''}
                          `}
                        >
                          {inMonth ? format(day, 'd') : ''}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-text-secondary rounded-lg hover:bg-bg-hover transition-colors"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
