import { useEffect, useMemo, useRef } from 'react'
import { AUDIO_BANDS, watchSpectrum } from '../lib/audio'

/**
 * 面板背景上的频谱。
 *
 * 它不是浮在卡片上的小条，而是贴在面板底部、垫在所有卡片下面的一层背景，
 * 所以这里只用 DOM transform 更新（每帧 30 次的量级），不走 React 状态，
 * 免得整块面板跟着重渲染。柱子左右对称，低频在两边、高频在中间。
 */
export function Spectrum({ label = '系统音频' }: { label?: string }) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([])
  const rootRef = useRef<HTMLDivElement | null>(null)
  // 28 段镜像成 55 根柱子，铺满整条底边。
  const bars = useMemo(
    () =>
      Array.from(
        { length: AUDIO_BANDS * 2 - 1 },
        (_, index) => AUDIO_BANDS - 1 - Math.abs(index - (AUDIO_BANDS - 1)),
      ),
    [],
  )

  useEffect(() => {
    let dispose: (() => void) | null = null
    let cancelled = false
    void watchSpectrum((frame) => {
      const nodes = barsRef.current
      for (let index = 0; index < nodes.length; index += 1) {
        const bar = nodes[index]
        if (!bar) continue
        const value = frame.bands[bars[index]] ?? 0
        bar.style.transform = `scaleY(${Math.max(0.02, value).toFixed(3)})`
        bar.style.opacity = String(0.28 + value * 0.62)
      }
      rootRef.current?.style.setProperty('--audio-level', frame.level.toFixed(3))
    }).then((off) => {
      if (cancelled) off()
      else dispose = off
    })
    return () => {
      cancelled = true
      if (dispose) dispose()
    }
  }, [bars])

  return (
    <div className="spectrum" ref={rootRef} role="img" aria-label={`${label}频谱`}>
      <div className="spectrum__bars" aria-hidden="true">
        {bars.map((_, index) => (
          <span
            key={index}
            className="spectrum__bar"
            ref={(element) => {
              barsRef.current[index] = element
            }}
          />
        ))}
      </div>
    </div>
  )
}
