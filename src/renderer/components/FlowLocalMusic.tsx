import { useEffect, useRef, useState } from 'react'
import { useFlowStore } from '../stores/flowStore'
import { useSettingsStore } from '../stores/settingsStore'

function shuffleArray<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]!
    a[i] = a[j]!
    a[j] = t
  }
  return a
}

/** Pasta local das definições: toca apenas na fase de foco do Flow (pausa durante break Pomodoro). */
export default function FlowLocalMusic() {
  const folderPath = useSettingsStore((s) => s.flowMusicFolderPath)
  const shufflePreferred = useSettingsStore((s) => s.flowMusicShuffle)

  const isActive = useFlowStore((s) => s.isActive)
  const started = useFlowStore((s) => s.started)
  const isPaused = useFlowStore((s) => s.isPaused)
  const phase = useFlowStore((s) => s.phase)

  const [playlist, setPlaylist] = useState<string[]>([])
  const playlistIndexRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const prevStartedRef = useRef(false)
  const shouldPlayRef = useRef(false)

  const shouldAudiblePlay = Boolean(
    folderPath &&
      playlist.length > 0 &&
      isActive &&
      started &&
      !isPaused &&
      phase === 'working'
  )

  shouldPlayRef.current = shouldAudiblePlay

  useEffect(() => {
    let cancelled = false

    if (!folderPath || !window.bloc?.music) {
      setPlaylist([])
      playlistIndexRef.current = 0
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
      return
    }

    void (async () => {
      const files = await window.bloc!.music.listAudioFiles(folderPath)
      if (cancelled) return
      const sorted = [...files].sort((a, b) =>
        decodeURIComponent(a).localeCompare(decodeURIComponent(b))
      )
      const ordered = shufflePreferred ? shuffleArray(sorted) : sorted
      setPlaylist(ordered)
      playlistIndexRef.current = 0
      if (audioRef.current) {
        const a = audioRef.current
        a.pause()
        a.removeAttribute('src')
        a.load()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [folderPath, shufflePreferred])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !folderPath || !playlist.length) return

    const wasStarted = prevStartedRef.current

    if (!started && wasStarted) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      playlistIndexRef.current = 0
    }

    if (started && !wasStarted) {
      playlistIndexRef.current = 0
      const href = playlist[0]!
      audio.pause()
      audio.src = href
      audio.load()
      if (shouldPlayRef.current) {
        void audio.play().catch(() => undefined)
      }
    }

    prevStartedRef.current = started
  }, [started, playlist, folderPath])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onEnded = (): void => {
      if (playlist.length === 0) return
      playlistIndexRef.current = (playlistIndexRef.current + 1) % playlist.length
      const href = playlist[playlistIndexRef.current]!
      audio.src = href
      audio.load()
      if (shouldPlayRef.current) {
        void audio.play().catch(() => undefined)
      }
    }

    audio.addEventListener('ended', onEnded)
    return () => audio.removeEventListener('ended', onEnded)
  }, [playlist])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !playlist.length || !started) return

    if (!audio.src) {
      playlistIndexRef.current = Math.min(playlistIndexRef.current, playlist.length - 1)
      const href = playlist[playlistIndexRef.current]!
      audio.src = href
      audio.load()
    }

    if (shouldAudiblePlay) {
      void audio.play().catch(() => undefined)
    } else {
      audio.pause()
    }
  }, [shouldAudiblePlay, playlist, started])

  return (
    <audio
      ref={audioRef}
      className="sr-only pointer-events-none"
      preload="metadata"
      aria-hidden
      title="Música do fluxo (pasta local)"
    />
  )
}
