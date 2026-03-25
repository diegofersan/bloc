let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.3) {
  const ctx = getAudioContext()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, ctx.currentTime)
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + duration)
}

export function playWorkDoneSound() {
  playTone(523, 0.15)
  setTimeout(() => playTone(659, 0.3), 150)
}

export function playBreakDoneSound() {
  playTone(392, 0.3)
}

export function playCountdownTick() {
  playTone(880, 0.05, 'sine', 0.08)
}

export function playIdleWarningSound() {
  playTone(440, 0.2, 'sine', 0.15)
  setTimeout(() => playTone(330, 0.3, 'sine', 0.15), 220)
}
