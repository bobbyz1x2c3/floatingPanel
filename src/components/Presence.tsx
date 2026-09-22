import type { Peer } from '../lib/online'

const QUADRANT_HUE: Record<string, number> = {
  do: 340,
  schedule: 210,
  delegate: 35,
  drop: 160,
}

/**
 * 面板背景上的「朋友位置」层：每个人一堆呼吸的小光点，
 * 位置就是对方卡片的相对位置——只有位置和大小，没有任何文字。
 */
export function Presence({ peers }: { peers: Peer[] }) {
  if (peers.length === 0) return null
  return (
    <div className="presence" aria-hidden="true">
      {peers.map((peer) => (
        <div key={peer.id} className="presence__peer" style={{ ['--peer-hue' as string]: peer.hue }}>
          {peer.dots.map((dot, index) => (
            <span
              key={index}
              className="presence__dot"
              style={{
                left: `${(dot.x * 100).toFixed(3)}%`,
                top: `${(dot.y * 100).toFixed(3)}%`,
                // 同一格的点和对方的色相稍微拉开一点，看着像一片而不是一坨
                ['--dot-hue' as string]: (QUADRANT_HUE[dot.q] ?? peer.hue) * 0.35 + peer.hue * 0.65,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
