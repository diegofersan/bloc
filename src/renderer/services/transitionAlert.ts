function showNotification(title: string, body: string): void {
  if (typeof document !== 'undefined' && document.hasFocus()) return

  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      window.bloc?.alertAttention()
      return
    }
    const n = new Notification(title, { body, silent: true })
    n.onclick = () => window.bloc?.focusWindow()
  } catch {
    // Notification API unavailable or threw — fall through to attention bounce
  }

  window.bloc?.alertAttention()
}

export function alertWorkDone(breakMinutes: number): void {
  showNotification('Bloc — Hora da pausa', `Pausa de ${breakMinutes} min`)
}

export function alertBreakDone(): void {
  showNotification('Bloc — De volta ao foco', 'A pausa terminou.')
}
