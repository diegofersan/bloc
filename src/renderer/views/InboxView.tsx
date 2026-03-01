import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, X, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, parseISO } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useTaskStore, type Distraction } from '../stores/taskStore'

export default function InboxView() {
  const navigate = useNavigate()
  const getPendingDistractions = useTaskStore((s) => s.getPendingDistractions)
  const convertToTask = useTaskStore((s) => s.convertToTask)
  const dismissDistraction = useTaskStore((s) => s.dismissDistraction)

  const pending = getPendingDistractions()

  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const grouped = useMemo(() => {
    const groups: Record<string, (Distraction & { _date: string })[]> = {}
    for (const d of pending) {
      const date = d._date
      if (!groups[date]) groups[date] = []
      groups[date].push(d)
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  }, [pending])

  const today = format(new Date(), 'yyyy-MM-dd')

  function handleConvertAll() {
    for (const d of pending) {
      convertToTask(d._date, d.id, today)
    }
  }

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Titlebar */}
      <div className={`titlebar-drag shrink-0 flex items-end pb-2 ${isNarrow ? 'px-3 pt-[38px]' : 'pl-5 pr-6 pt-[50px]'}`}>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <ArrowLeft size={18} />
        </motion.button>
      </div>

      {/* Content */}
      <div className={`flex-1 overflow-y-auto pb-8 ${isNarrow ? 'px-3' : 'pl-5 pr-6'}`}>
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4 pt-4">
          Caixa de Entrada
        </h2>

        {pending.length > 0 ? (
          <>
            <div className={`flex mb-6 ${isNarrow ? 'flex-col gap-2' : 'items-center justify-between'}`}>
              <p className="text-sm text-text-muted">
                {pending.length} {pending.length === 1 ? 'distração por processar' : 'distrações por processar'}
              </p>
              <button
                onClick={handleConvertAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent bg-accent-subtle rounded-lg hover:bg-accent/10 transition-colors"
              >
                <ArrowRight size={12} />
                Converter tudo para hoje
              </button>
            </div>

            {grouped.map(([date, items]) => (
              <div key={date} className="mb-6">
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 sticky top-0 bg-bg-primary py-1">
                  {format(parseISO(date), 'd MMM', { locale: pt }).toUpperCase()}
                </h3>
                <AnimatePresence>
                  {items.map((d) => (
                    <motion.div
                      key={d.id}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -16, transition: { duration: 0.15 } }}
                      transition={{ duration: 0.2 }}
                      className="group flex items-center gap-3 py-2.5 px-4 rounded-lg hover:bg-bg-hover transition-colors"
                    >
                      <div className="shrink-0 w-2 h-2 rounded-full border border-distraction" />
                      <span className="shrink-0 text-xs text-text-muted tabular-nums">
                        {format(d.createdAt, 'HH:mm')}
                      </span>
                      <span className="flex-1 text-sm text-text-primary">{d.text}</span>

                      {/* Quick convert: today */}
                      <button
                        onClick={() => convertToTask(d._date, d.id, today)}
                        className={`shrink-0 px-2 py-1 text-xs font-medium text-accent bg-accent-subtle rounded hover:bg-accent/10 transition-colors ${isNarrow ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
                      >
                        Hoje
                      </button>

                      {/* Navigate to day for date pick */}
                      <button
                        onClick={() => navigate(`/day/${d._date}`)}
                        aria-label="Escolher data"
                        className={`shrink-0 p-1 rounded hover:bg-bg-tertiary transition-all ${isNarrow ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
                      >
                        <Calendar size={14} className="text-text-muted" />
                      </button>

                      {/* Dismiss */}
                      <button
                        onClick={() => dismissDistraction(d._date, d.id)}
                        aria-label="Descartar distração"
                        className={`shrink-0 p-1 rounded hover:bg-bg-tertiary transition-all ${isNarrow ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
                      >
                        <X size={14} className="text-text-muted hover:text-text-secondary transition-colors" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ))}
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center h-full text-center"
          >
            <p className="text-lg font-medium text-text-primary mb-1">Tudo processado.</p>
            <p className="text-sm text-text-muted">Sem distrações pendentes.</p>
          </motion.div>
        )}
      </div>
    </div>
  )
}
