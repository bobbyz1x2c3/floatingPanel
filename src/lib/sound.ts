/**
 * 归档完成的提示音。用 Web Audio 现场合成，省掉一个音频资源，
 * 也免得打包时还要处理不同平台的解码问题。
 */
let context: AudioContext | null = null

type AudioContextCtor = typeof AudioContext

function resolveCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const scoped = window as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return scoped.AudioContext ?? scoped.webkitAudioContext ?? null
}

function ensureContext(): AudioContext | null {
  const Ctor = resolveCtor()
  if (!Ctor) return null
  if (!context) {
    try {
      context = new Ctor()
    } catch {
      return null
    }
  }
  if (context.state === 'suspended') void context.resume()
  return context
}

interface ToneOptions {
  frequency: number
  startAt: number
  duration: number
  gain: number
  type?: OscillatorType
}

function playTone(ctx: AudioContext, options: ToneOptions): void {
  const { frequency, startAt, duration, gain, type = 'sine' } = options
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 5200

  osc.type = type
  osc.frequency.setValueAtTime(frequency, startAt)
  amp.gain.setValueAtTime(0.0001, startAt)
  amp.gain.exponentialRampToValueAtTime(gain, startAt + 0.014)
  amp.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)

  osc.connect(filter)
  filter.connect(amp)
  amp.connect(ctx.destination)
  osc.start(startAt)
  osc.stop(startAt + duration + 0.03)
}

/** 两声上行的轻响，A5 → E6，够短也够“完成”。 */
export function playCompleteSound(): void {
  const ctx = ensureContext()
  if (!ctx) return
  const now = ctx.currentTime + 0.012
  playTone(ctx, { frequency: 880, startAt: now, duration: 0.18, gain: 0.13 })
  playTone(ctx, { frequency: 1318.51, startAt: now + 0.085, duration: 0.36, gain: 0.1 })
}

/**
 * 番茄钟结束：三声下行再上行的钟声，比完成音更长一点，
 * 不用看屏幕也知道「那段时间到了」。默认音色换成三角波，听着更像铃。
 */
export function playTimerSound(): void {
  const ctx = ensureContext()
  if (!ctx) return
  const now = ctx.currentTime + 0.02
  playTone(ctx, { frequency: 1174.66, startAt: now, duration: 0.42, gain: 0.1, type: 'triangle' })
  playTone(ctx, { frequency: 880, startAt: now + 0.16, duration: 0.46, gain: 0.1, type: 'triangle' })
  playTone(ctx, { frequency: 587.33, startAt: now + 0.32, duration: 0.8, gain: 0.12, type: 'triangle' })
}
