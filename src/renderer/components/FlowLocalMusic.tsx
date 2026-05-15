import { useEffect, useRef, useState } from 'react'
import { useFlowStore } from '../stores/flowStore'
import { useSettingsStore } from '../stores/settingsStore'

/** Duração do fade in ao iniciar o foco Pomodoro e fade out antes do break (segundos). */
const FADE_SEC = 5
const FADE_MS = FADE_SEC * 1000

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

/** Volume segundo fase trabalho Pomodoro: entrada suave (~5 s) + saída nos últimos 5 s. */
function computeFlowMusicVolume(opts: {
  fadeAccumMs: number
  secondsRemaining: number
  phase: 'working' | 'break'
  started: boolean
  isPaused: boolean
}): number {
  const { fadeAccumMs, secondsRemaining, phase, started, isPaused } = opts
  if (!started || phase !== 'working' || isPaused) return 0

  let v = 1
  const rem = secondsRemaining
  if (rem <= FADE_SEC) {
    v = Math.min(v, rem / FADE_SEC)
  }

  const fadeIn = Math.min(1, fadeAccumMs / FADE_MS)
  v = Math.min(v, fadeIn)

  return Math.max(0, Math.min(1, v))
}

/** Pasta local das definições: toca apenas na fase de foco do Flow (pausa durante break Pomodoro). */
export default function FlowLocalMusic() {
  const folderPath = useSettingsStore((s) => s.flowMusicFolderPath)
  const shufflePreferred = useSettingsStore((s) => s.flowMusicShuffle)
  const flowMusicDuringFlow = useSettingsStore((s) => s.flowMusicDuringFlow)

  const isActive = useFlowStore((s) => s.isActive)
  const started = useFlowStore((s) => s.started)
  const isPaused = useFlowStore((s) => s.isPaused)
  const phase = useFlowStore((s) => s.phase)

  const [playlist, setPlaylist] = useState<string[]>([])
  const playlistIndexRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  /** Só para o efeito de arranque/paragem do elemento audio (sem colidir com o fade). */
  const prevStartedAudioRef = useRef(false)
  /** Estado anterior para saber quando recomeça um segmento de foco Pomodoro (fade-in). */
  const prevPhaseFadeRef = useRef<typeof phase | undefined>(undefined)
  const prevStartedFadeRef = useRef(false)
  const shouldPlayRef = useRef(false)
  const fadeAccumMsRef = useRef(0)

  const shouldAudiblePlay = Boolean(
    folderPath &&
      flowMusicDuringFlow &&
      playlist.length > 0 &&
      isActive &&
      started &&
      !isPaused &&
      phase === 'working'
  )

  shouldPlayRef.current = shouldAudiblePlay

  const syncAudioVolume = (audio: HTMLAudioElement): void => {
    const s = useFlowStore.getState()
    audio.volume = computeFlowMusicVolume({
      fadeAccumMs: fadeAccumMsRef.current,
      secondsRemaining: s.getSecondsRemaining(),
      phase: s.phase,
      started: s.started,
      isPaused: s.isPaused
    })
  }

  // Novo segmento de foco Pomodoro (início Flow ou regressão break → trabalho): recomeça fade-in.
  useEffect(() => {
    const pp = prevPhaseFadeRef.current
    const ps = prevStartedFadeRef.current
    const workSegmentBegins =
      (pp === 'break' && phase === 'working') || (!ps && started && phase === 'working')
    if (workSegmentBegins) {
      fadeAccumMsRef.current = 0
    }
    prevPhaseFadeRef.current = phase
    prevStartedFadeRef.current = started
  }, [phase, started])

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
        audio.volume = 1
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
        a.volume = 1
      }
    })()

    return () => {
      cancelled = true
    }
  }, [folderPath, shufflePreferred])

  // Atualizar volume em tempo real (fade-out últimos segundos precisa de sub-segundo).
  useEffect(() => {
    if (!folderPath || playlist.length === 0 || !started || !isActive) return
    if (phase !== 'working' || isPaused || !flowMusicDuringFlow) return

    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(64, now - last)
      last = now

      const s = useFlowStore.getState()
      const musicOn = useSettingsStore.getState().flowMusicDuringFlow
      const audible =
        musicOn &&
        s.isActive &&
        s.started &&
        !s.isPaused &&
        s.phase === 'working' &&
        playlist.length > 0

      if (audible && fadeAccumMsRef.current < FADE_MS) {
        fadeAccumMsRef.current += dt
      }

      const audio = audioRef.current
      if (audio) {
        syncAudioVolume(audio)
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [folderPath, playlist.length, started, isActive, phase, isPaused, flowMusicDuringFlow])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !folderPath || !playlist.length) return

    const wasStarted = prevStartedAudioRef.current

    if (!started && wasStarted) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audio.volume = 1
      playlistIndexRef.current = 0
    }

    if (started && !wasStarted) {
      playlistIndexRef.current = 0
      const href = playlist[0]!
      audio.pause()
      audio.src = href
      audio.load()
      syncAudioVolume(audio)
      if (shouldPlayRef.current) {
        void audio.play().catch(() => undefined)
      }
    }

    prevStartedAudioRef.current = started
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
      syncAudioVolume(audio)
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
      syncAudioVolume(audio)
    }

    if (shouldAudiblePlay) {
      syncAudioVolume(audio)
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
