import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lightbulb, Loader2 } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { ideaToIssue } from '../services/aiService'

type Status = 'idle' | 'input' | 'processing' | 'success' | 'error'

const REPO = 'diegofersan/bloc'

export default function IdeaButton({ onToast }: { onToast: (msg: string, action?: { label: string; onClick: () => void }) => void }) {
  const [status, setStatus] = useState<Status>('idle')
  const [text, setText] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const provider = useSettingsStore((s) => s.provider)
  const apiKey = useSettingsStore((s) => s.apiKey)
  const model = useSettingsStore((s) => s.model)
  const githubToken = useSettingsStore((s) => s.githubToken)

  // Focus input when popover opens
  useEffect(() => {
    if (status === 'input') {
      inputRef.current?.focus()
    }
  }, [status])

  // Close on click outside
  useEffect(() => {
    if (status === 'idle') return

    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setStatus('idle')
        setText('')
        setErrorMsg('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [status])

  // Close on Escape
  useEffect(() => {
    if (status === 'idle') return

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setStatus('idle')
        setText('')
        setErrorMsg('')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [status])

  async function handleSubmit() {
    const idea = text.trim()
    if (!idea) return

    if (!apiKey) {
      setErrorMsg('Configura a chave API em Definições')
      setStatus('error')
      return
    }
    if (!githubToken) {
      setErrorMsg('Configura o token GitHub em Definições')
      setStatus('error')
      return
    }

    setStatus('processing')
    setErrorMsg('')

    try {
      const { title, body } = await ideaToIssue(idea, provider, apiKey, model)

      const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title, body })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.message ?? `GitHub API error: ${res.status}`)
      }

      const issue = await res.json()

      setStatus('idle')
      setText('')
      onToast('Issue criada', {
        label: 'Abrir',
        onClick: () => window.open(issue.html_url, '_blank')
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      setErrorMsg(message)
      setStatus('error')
    }
  }

  return (
    <div ref={containerRef} className="fixed bottom-4 right-4 z-40">
      <AnimatePresence>
        {(status === 'input' || status === 'processing' || status === 'error') && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-9 right-0 w-72 bg-bg-secondary border border-border rounded-lg shadow-lg p-3"
          >
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              disabled={status === 'processing'}
              placeholder="Descreve a ideia..."
              className="w-full rounded-md bg-bg-primary border border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
            />
            {status === 'processing' && (
              <div className="flex items-center gap-2 mt-2 text-xs text-text-muted">
                <Loader2 size={12} className="animate-spin" />
                <span>A processar...</span>
              </div>
            )}
            {status === 'error' && errorMsg && (
              <p className="mt-2 text-xs text-red-500">{errorMsg}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {status === 'success' ? null : (
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            if (status === 'idle') {
              setStatus('input')
              setErrorMsg('')
            } else if (status === 'error') {
              setStatus('input')
              setErrorMsg('')
            }
          }}
          disabled={status === 'processing'}
          className="w-[30px] h-[30px] rounded-full bg-bg-secondary border border-border shadow-sm flex items-center justify-center text-text-muted hover:text-accent hover:border-accent transition-colors disabled:opacity-50"
          aria-label="Nova ideia"
        >
          {status === 'processing' ? (
            <Loader2 size={14} className="animate-spin text-accent" />
          ) : (
            <Lightbulb size={14} />
          )}
        </motion.button>
      )}
    </div>
  )
}
