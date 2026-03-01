import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Copy, Check, Sparkles, RotateCcw, Loader2 } from 'lucide-react'
import { format, subDays } from 'date-fns'
import {
  gatherDayData,
  formatTemplateStandup,
  generateAIStandup,
  formatForClipboard,
  type StandupResult,
  type DaySnapshot
} from '../services/dailyStandupService'
import { useSettingsStore } from '../stores/settingsStore'

export default function DailyStandupModal({
  visible,
  onClose
}: {
  visible: boolean
  onClose: () => void
}) {
  const [result, setResult] = useState<StandupResult | null>(null)
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const previousFocusRef = useRef<Element | null>(null)
  const snapshotsRef = useRef<{ yesterday: DaySnapshot; today: DaySnapshot } | null>(null)

  const { provider, apiKey, model, isConfigured } = useSettingsStore()

  // Generate template on open
  useEffect(() => {
    if (!visible) return
    previousFocusRef.current = document.activeElement

    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd')

    const yesterday = gatherDayData(yesterdayStr)
    const today = gatherDayData(todayStr)
    snapshotsRef.current = { yesterday, today }

    setResult(formatTemplateStandup(yesterday, today))
    setAiError(null)
    setCopied(false)
  }, [visible])

  // Restore focus on close
  useEffect(() => {
    if (!visible && previousFocusRef.current instanceof HTMLElement) {
      previousFocusRef.current.focus()
    }
  }, [visible])

  // Keyboard: Escape to close
  useEffect(() => {
    if (!visible) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [visible, onClose])

  const handleCopy = useCallback(async () => {
    if (!result) return
    await navigator.clipboard.writeText(formatForClipboard(result))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [result])

  const handleEnhanceAI = useCallback(async () => {
    if (!snapshotsRef.current) return
    setIsEnhancing(true)
    setAiError(null)
    try {
      const aiResult = await generateAIStandup(
        snapshotsRef.current.yesterday,
        snapshotsRef.current.today,
        provider,
        apiKey,
        model
      )
      setResult(aiResult)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Erro ao gerar com IA')
    } finally {
      setIsEnhancing(false)
    }
  }, [provider, apiKey, model])

  const handleBackToTemplate = useCallback(() => {
    if (!snapshotsRef.current) return
    setResult(formatTemplateStandup(snapshotsRef.current.yesterday, snapshotsRef.current.today))
    setAiError(null)
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          role="dialog"
          aria-modal="true"
          aria-label="Daily Standup"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
            className="mt-[10vh] sm:mt-[15vh] w-[520px] max-w-[calc(100vw-32px)] max-h-[70vh] flex flex-col bg-bg-secondary border border-border rounded-xl shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/50">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Daily Standup</h2>
                <p className="text-xs text-text-muted mt-0.5">
                  {format(new Date(), 'dd/MM/yyyy')}
                  {result?.source === 'ai' && (
                    <span className="ml-2 text-accent">IA</span>
                  )}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Fechar"
                className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {result && (
                <>
                  <Section title="Ontem" content={result.yesterday} />
                  <Section title="Hoje" content={result.today} />
                  <Section title="Bloqueios" content={result.blockers} />
                </>
              )}

              {aiError && (
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-xs text-rose-400">
                  {aiError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 flex items-center justify-between px-5 py-3 border-t border-border/50">
              <div className="flex items-center gap-2">
                {isConfigured() && result?.source !== 'ai' && (
                  <button
                    onClick={handleEnhanceAI}
                    disabled={isEnhancing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-accent hover:bg-accent-subtle transition-colors disabled:opacity-50"
                  >
                    {isEnhancing ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    {isEnhancing ? 'A gerar...' : 'Melhorar com IA'}
                  </button>
                )}

                {result?.source === 'ai' && (
                  <button
                    onClick={handleBackToTemplate}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors"
                  >
                    <RotateCcw size={14} />
                    Voltar ao template
                  </button>
                )}
              </div>

              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-text-secondary mb-1.5">
        {title}
      </h3>
      <div className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap pl-1">
        {content}
      </div>
    </div>
  )
}
