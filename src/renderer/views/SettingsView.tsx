import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { useSettingsStore, type AIProvider } from '../stores/settingsStore'
import { usePomodoroStore } from '../stores/pomodoroStore'

const providers: { id: AIProvider; name: string; description: string }[] = [
  { id: 'openai', name: 'OpenAI', description: 'GPT-4o & mais' },
  { id: 'anthropic', name: 'Anthropic', description: 'Claude Sonnet & mais' },
  { id: 'gemini', name: 'Gemini', description: 'Gemini Flash & mais' }
]

export default function SettingsView() {
  const navigate = useNavigate()
  const { provider, apiKey, model, setProvider, setApiKey, setModel } = useSettingsStore()
  const { workDuration, breakDuration, setWorkDuration, setBreakDuration } = usePomodoroStore()

  const [showKey, setShowKey] = useState(false)

  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Titlebar */}
      <div className={`titlebar-drag shrink-0 flex items-end pb-2 ${isNarrow ? 'px-3 pt-[38px]' : 'pl-5 pr-6 pt-[50px]'}`}>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/')}
          aria-label="Voltar"
          className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <ArrowLeft size={18} />
        </motion.button>
      </div>

      <div className={`flex-1 overflow-y-auto pb-12 ${isNarrow ? 'px-3' : 'pl-5 pr-6'}`}>
        <div className="max-w-xl">
          {/* Header */}
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 pt-4">
            Definições
          </h2>
          <p className="text-xs text-text-muted mb-8">As definições são guardadas automaticamente</p>

          {/* AI Provider */}
          <section className="mb-8">
            <label className="block text-sm font-medium text-text-secondary mb-3">
              Fornecedor de IA
            </label>
            <div className={`grid gap-3 ${isNarrow ? 'grid-cols-1' : 'grid-cols-3'}`}>
              {providers.map((p) => {
                const active = provider === p.id
                return (
                  <motion.button
                    key={p.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setProvider(p.id)}
                    className={`relative rounded-xl p-4 text-left border transition-colors ${
                      active
                        ? 'bg-accent/10 border-accent'
                        : 'bg-bg-secondary border-border hover:border-border-light'
                    }`}
                  >
                    {active && (
                      <motion.div
                        layoutId="provider-check"
                        className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-accent flex items-center justify-center"
                      >
                        <Check size={12} className="text-white" />
                      </motion.div>
                    )}
                    <div className={`text-sm font-medium ${active ? 'text-accent-hover' : 'text-text-primary'}`}>
                      {p.name}
                    </div>
                    <div className="text-xs text-text-muted mt-1">{p.description}</div>
                  </motion.button>
                )
              })}
            </div>
          </section>

          {/* API Key */}
          <section className="mb-6">
            <label className="block text-sm font-medium text-text-secondary mb-2">Chave API</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Insira a sua chave API"
                className="w-full rounded-lg bg-bg-secondary border border-border px-4 py-3 pr-12 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </section>

          {/* Model */}
          <section className="mb-10">
            <label className="block text-sm font-medium text-text-secondary mb-2">Modelo</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-lg bg-bg-secondary border border-border px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </section>

          {/* Pomodoro */}
          <section className="mb-10">
            <label className="block text-sm font-medium text-text-secondary mb-3">
              Pomodoro
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Foco (min)</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={workDuration}
                  onChange={(e) => setWorkDuration(Number(e.target.value) || 1)}
                  className="w-full rounded-lg bg-bg-secondary border border-border px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Descanso (min)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={breakDuration}
                  onChange={(e) => setBreakDuration(Number(e.target.value) || 1)}
                  className="w-full rounded-lg bg-bg-secondary border border-border px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
