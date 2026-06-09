import { useState } from 'react'
import { LogOut } from 'lucide-react'

export default function QuitButton() {
  const [confirming, setConfirming] = useState(false)

  function handleClick() {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 2200)
      return
    }
    window.bloc?.quitApp()
  }

  return (
    <button
      onClick={handleClick}
      onMouseLeave={() => setConfirming(false)}
      aria-label={confirming ? 'Confirmar saída do Bloc' : 'Sair do Bloc'}
      title={confirming ? 'Clica de novo para confirmar' : 'Sair do Bloc (⌘Q)'}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className={`fixed top-3 right-11 z-[60] p-1.5 rounded-md transition-colors ${
        confirming
          ? 'bg-error/15 text-error opacity-100'
          : 'text-text-muted/40 hover:text-text-secondary hover:bg-bg-hover opacity-60 hover:opacity-100'
      }`}
    >
      <LogOut size={13} aria-hidden="true" />
    </button>
  )
}
