import { useState, useEffect, useCallback, useRef } from 'react'
import { Zap } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { useTaskStore } from '../stores/taskStore'
import DistractionItem from './DistractionItem'

interface DistractionSidebarProps {
  date: string
  /** Show the title header (hidden when inside a tab) */
  showHeader?: boolean
  /** Listen for Cmd+D keyboard shortcut to focus input */
  keyboardShortcut?: boolean
}

export default function DistractionSidebar({ date, showHeader = true, keyboardShortcut = true }: DistractionSidebarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [inputValue, setInputValue] = useState('')
  const allDistractions = useTaskStore((s) => s.distractions)
  const addDistraction = useTaskStore((s) => s.addDistraction)
  const convertToTask = useTaskStore((s) => s.convertToTask)

  const distractions = (allDistractions[date] || []).filter((d) => d.status === 'pending')

  const handleAdd = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    addDistraction(date, trimmed)
    setInputValue('')
    inputRef.current?.focus()
  }, [inputValue, date, addDistraction])

  // Keyboard shortcut: Cmd+D to focus input
  useEffect(() => {
    if (!keyboardShortcut) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [keyboardShortcut])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header + input */}
      <div className={`shrink-0 ${showHeader ? 'px-4 pt-4 pb-1' : 'px-3 pt-2 pb-1'}`}>
        {showHeader && (
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xs font-medium text-text-muted/70 uppercase tracking-wider">
              Distrações
            </h2>
            {distractions.length > 0 && (
              <span className="text-xs font-medium text-distraction bg-distraction/15 rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1.5">
                {distractions.length}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Zap size={10} className="shrink-0 text-distraction" />
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            placeholder={keyboardShortcut ? 'Capturar distração... ⌘D' : 'Anotar distração...'}
            className="flex-1 text-sm bg-transparent rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:bg-bg-secondary/60 transition-colors"
            spellCheck={false}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {distractions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-2 text-center">
            <Zap size={16} className="text-distraction/20 mb-2" />
            <p className="text-text-muted/40 text-xs leading-relaxed">
              Pensamentos e impulsos que surgem durante o foco vão aqui.
            </p>
            <p className="text-[10px] text-text-muted/30 mt-1">
              ⌘⇧D para captura rápida
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {distractions.map((d) => (
              <DistractionItem
                key={d.id}
                distraction={d}
                date={date}
                onConvert={(id) => convertToTask(date, id, date)}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
