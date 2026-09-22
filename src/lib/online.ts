import { createId } from './id'
import type { CardData, Quadrant, ZoneSize } from './types'

/**
 * 联机「在场感」：同一个房间里的人能互相看到对方卡片的位置，
 * 但**只发位置和大小**，不发标题、正文、附件——收到的那一头拿到的就是一堆坐标。
 *
 * 传输走 MQTT over WebSocket（默认连 EMQX 的公共 broker），
 * 房间号就是 topic：`nemufloat/room/<房间号>/presence`。
 * 换成自己的服务器只要改设置里的地址，协议不变。
 */

export const DEFAULT_BROKER = 'wss://broker.emqx.io:8084/mqtt'

/** 一个点：只有归一化坐标（0~1，相对画布可视区）和象限——连大小都不发。 */
export interface PresenceDot {
  x: number
  y: number
  /** 象限，用来上色（对方看到的是「某个象限有个点」，仍然不知道内容）。 */
  q: Quadrant
}

export interface PresencePayload {
  /** 协议版本，以后改字段用。 */
  v: 1
  /** 本端随机 id。 */
  id: string
  /** 发送时刻，接收端用它判断过期。 */
  at: number
  /** 离开时发一个空点集的告别包。 */
  bye?: boolean
  dots: PresenceDot[]
}

export interface Peer {
  id: string
  /** 色相：给每个 peer 固定一个，看起来像不同的人。 */
  hue: number
  at: number
  dots: PresenceDot[]
}

const TOPIC_PREFIX = 'nemufloat/room/'
const MAX_DOTS = 24
/** 超过这么久没收到就当作离线。 */
const PEER_TIMEOUT = 6000
/** 就算自己的卡片没动，也隔这么久报一次平安（要小于 PEER_TIMEOUT）。 */
const HEARTBEAT = 2400

export function roomTopic(room: string): string {
  return `${TOPIC_PREFIX}${room.trim().toLowerCase()}/presence`
}

/** 生成一个好念的房间号：6 位，去掉容易看错的 0/o/1/l/i。 */
export function createRoomCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let code = ''
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}

/** 每个 peer 一个固定色相（避开和强调色太像的蓝紫区，默认从 20° 开始铺开）。 */
export function hueFor(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 100000
  }
  return (hash * 47) % 360
}

/** 把当前卡片压成归一化的点集（不含任何文字信息）。 */
export function dotsFromCards(cards: CardData[], zone: ZoneSize): PresenceDot[] {
  const boardW = zone.width * 2
  const boardH = zone.height * 2
  if (boardW <= 0 || boardH <= 0) return []
  return cards
    .slice(0, MAX_DOTS)
    .map((card) => {
      return {
        // 点落在卡片中心，再归一化到 0~1
        x: Math.min(1, Math.max(0, (card.x + card.width / 2) / boardW)),
        y: Math.min(1, Math.max(0, (card.y + (card.collapsed ? 58 : card.height) / 2) / boardH)),
        q: card.quadrant,
      }
    })
}

export interface PresenceHandlers {
  onPeers: (peers: Peer[]) => void
  onStatus: (status: 'connecting' | 'online' | 'offline' | 'error', detail?: string) => void
}

/** 只用到 mqtt 客户端的这几个方法，自己写个最小接口，省得把整包类型引进来。 */
interface MqttClient {
  on: (event: string, handler: (...args: never[]) => void) => void
  subscribe: (topic: string, options?: { qos: 0 | 1 | 2 }) => void
  publish: (
    topic: string,
    payload: string,
    options?: { qos: 0 | 1 | 2; retain?: boolean },
    callback?: () => void,
  ) => void
  end: (force?: boolean) => void
}

export interface PresenceSession {
  /** 主动离开并断开。 */
  close: () => void
  /** 更新自己要广播的点集（卡片挪动时调用，内部会节流）。 */
  publish: (dots: PresenceDot[]) => void
  /** 当前房间号。 */
  room: string
  clientId: string
}

/**
 * 连上 broker 并加入某个房间。返回的 session 负责：
 *  - 每秒广播一次自己的点集（有变化才发）
 *  - 维护别人的点集，超时 / 收到 bye 就移除
 */
export async function joinRoom(
  room: string,
  brokerUrl: string,
  handlers: PresenceHandlers,
): Promise<PresenceSession> {
  /*
    mqtt 的 ESM/CJS 互操作：打包后可能是 { connect } 也可能是 { default: { connect } }，
    两种都兜住，免得某次依赖升级后这里悄悄炸掉。
  */
  const loaded = (await import('mqtt')) as unknown as {
    connect?: unknown
    default?: { connect?: unknown }
  }
  const connect =
    typeof loaded.connect === 'function'
      ? (loaded.connect as (url: string, options: Record<string, unknown>) => MqttClient)
      : typeof loaded.default?.connect === 'function'
        ? (loaded.default.connect as (url: string, options: Record<string, unknown>) => MqttClient)
        : null
  if (!connect) throw new Error('mqtt 模块没有导出 connect')
  const clientId = `nemu-${createId().slice(0, 12)}`
  const topic = roomTopic(room)
  const peers = new Map<string, Peer>()
  let closed = false
  let lastDots: PresenceDot[] = []
  let dirty = true
  let lastSentAt = 0

  const flushPeers = () => handlers.onPeers([...peers.values()])

  handlers.onStatus('connecting')
  const client = connect(brokerUrl, {
    clientId,
    clean: true,
    reconnectPeriod: 3000,
    connectTimeout: 8000,
    keepalive: 30,
  })

  const send = (payload: PresencePayload) => {
    if (closed) return
    try {
      client.publish(topic, JSON.stringify(payload), { qos: 0, retain: false })
    } catch {
      /* 断了就等重连 */
    }
  }

  client.on('connect', () => {
    handlers.onStatus('online')
    client.subscribe(topic, { qos: 0 })
    // 连上先报一次位置，别人不用等下一个心跳
    lastSentAt = Date.now()
    send({ v: 1, id: clientId, at: Date.now(), dots: lastDots })
  })
  client.on('reconnect', () => handlers.onStatus('connecting'))
  client.on('close', () => handlers.onStatus('offline'))
  client.on('error', (error: Error) => handlers.onStatus('error', error.message))
  client.on('message', (incomingTopic: string, payload: Uint8Array) => {
    if (incomingTopic !== topic) return
    let parsed: PresencePayload
    try {
      parsed = JSON.parse(new TextDecoder().decode(payload)) as PresencePayload
    } catch {
      return
    }
    if (!parsed || parsed.v !== 1 || typeof parsed.id !== 'string' || parsed.id === clientId) return
    if (parsed.bye) {
      peers.delete(parsed.id)
      flushPeers()
      return
    }
    if (!Array.isArray(parsed.dots)) return
    peers.set(parsed.id, {
      id: parsed.id,
      hue: hueFor(parsed.id),
      at: Date.now(),
      dots: parsed.dots.slice(0, MAX_DOTS),
    })
    flushPeers()
  })

  /*
    广播：卡片动过就发，另外每 HEARTBEAT 再发一次「我还在」——
    否则一个不动的人在他自己那边永远不会再发消息，后进房间的人就看不到他。
  */
  const tick = window.setInterval(() => {
    if (closed) return
    const now = Date.now()
    if (dirty || now - lastSentAt > HEARTBEAT) {
      dirty = false
      lastSentAt = now
      send({ v: 1, id: clientId, at: now, dots: lastDots })
    }
    // 顺手清理掉过期的 peer
    let changed = false
    for (const [id, peer] of peers) {
      if (now - peer.at > PEER_TIMEOUT) {
        peers.delete(id)
        changed = true
      }
    }
    if (changed) flushPeers()
  }, 1000)

  return {
    room,
    clientId,
    publish: (dots) => {
      lastDots = dots
      dirty = true
    },
    close: () => {
      closed = true
      window.clearInterval(tick)
      peers.clear()
      handlers.onPeers([])
      handlers.onStatus('offline')
      /*
        告别包要等真正发出去再断：直接用 end(true) 会把还在队列里的 publish 一起丢掉，
        对面就得等 6 秒超时才把我移除。这里等 publish 回调再优雅断开，另留一个兜底。
      */
      try {
        client.publish(
          topic,
          JSON.stringify({ v: 1, id: clientId, at: Date.now(), bye: true, dots: [] }),
          { qos: 0, retain: false },
          () => {
            try {
              client.end(false)
            } catch {
              /* 已经断了 */
            }
          },
        )
      } catch {
        /* 连接已经没了 */
      }
      window.setTimeout(() => {
        try {
          client.end(true)
        } catch {
          /* 已经断了 */
        }
      }, 1000)
    },
  }
}
