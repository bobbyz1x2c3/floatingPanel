import { useState } from 'react'
import { NeuButton, NeuField } from './controls'
import { IconClose, IconUsers } from './icons'
import { createRoomCode } from '../lib/online'

export type RoomStatus = 'idle' | 'connecting' | 'online' | 'offline' | 'error'

export interface RoomDrawerProps {
  room: string
  status: RoomStatus
  detail: string
  peerCount: number
  broker: string
  lastRoom: string
  onJoin: (room: string) => void
  onLeave: () => void
  onBrokerChange: (value: string) => void
  onClose: () => void
}

const STATUS_LABEL: Record<RoomStatus, string> = {
  idle: '未联机',
  connecting: '连接中…',
  online: '已联机',
  offline: '已断开',
  error: '连接出错',
}

/** 联机抽屉：创建 / 加入房间，看在线人数。 */
export function RoomDrawer({
  room,
  status,
  detail,
  peerCount,
  broker,
  lastRoom,
  onJoin,
  onLeave,
  onBrokerChange,
  onClose,
}: RoomDrawerProps) {
  const [input, setInput] = useState(lastRoom)
  const [showBroker, setShowBroker] = useState(false)
  const joined = room.length > 0

  return (
    <aside className="drawer drawer--room nm-scroll" aria-label="联机房间">
      <div className="drawer__head">
        <h2 className="drawer__title">
          <IconUsers size={16} />
          <span>联机</span>
        </h2>
        <NeuButton iconOnly size="sm" aria-label="关闭联机面板" title="关闭" onClick={onClose}>
          <IconClose size={15} />
        </NeuButton>
      </div>

      <hr className="nm-divider" />

      {joined ? (
        <div className="drawer__group">
          <span className="nm-label">当前房间</span>
          <p className="room__code">{room}</p>
          <p className="drawer__note">
            {STATUS_LABEL[status]}
            {detail ? ` · ${detail}` : ''} · 同房间 {peerCount} 人
          </p>
          <p className="drawer__note">
            把房间号发给朋友，让对方在「联机」里输进来。你们只会看到彼此卡片位置上的
            <b>呼吸光点</b>——没有标题、没有正文，只有相对位置。
          </p>
          <div className="drawer__actions">
            <NeuButton
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(room).then(
                  () => undefined,
                  () => undefined,
                )
              }}
            >
              复制房间号
            </NeuButton>
            <NeuButton size="sm" variant="danger" onClick={onLeave}>
              离开房间
            </NeuButton>
          </div>
        </div>
      ) : (
        <div className="drawer__group">
          <span className="nm-label">加入房间</span>
          <div className="room__row">
            <NeuField
              value={input}
              placeholder="房间号，例如 k7m2pd"
              aria-label="房间号"
              spellCheck={false}
              onChange={(event) => setInput(event.target.value)}
            />
            <NeuButton
              size="sm"
              variant="primary"
              disabled={!input.trim()}
              onClick={() => onJoin(input.trim())}
            >
              加入
            </NeuButton>
          </div>
          <div className="drawer__actions">
            <NeuButton
              size="sm"
              onClick={() => {
                const code = createRoomCode()
                setInput(code)
                onJoin(code)
              }}
            >
              创建新房间
            </NeuButton>
            <NeuButton size="sm" variant="ghost" onClick={() => setShowBroker((open) => !open)}>
              {showBroker ? '收起服务器设置' : '服务器设置'}
            </NeuButton>
          </div>
          {showBroker ? (
            <div className="room__row">
              <NeuField
                value={broker}
                aria-label="联机服务器地址"
                spellCheck={false}
                placeholder="wss://…"
                onChange={(event) => onBrokerChange(event.target.value)}
              />
            </div>
          ) : null}
          {(status === 'error' || status === 'connecting' || status === 'offline') && detail ? (
            <p className="drawer__note room__error">
              {STATUS_LABEL[status]}：{detail}
            </p>
          ) : null}
          <p className="drawer__note">
            默认走公共 MQTT broker（EMQX）。想用自己的服务器就改上面那一栏，协议不变：
            <code>nemufloat/room/&lt;房间号&gt;/presence</code>。
          </p>
        </div>
      )}

      <hr className="nm-divider" />

      <div className="drawer__group">
        <span className="nm-label">隐私</span>
        <p className="drawer__note">
          广播的内容只有：一个随机 id、时间戳，以及每张卡片的<b>归一化坐标和大小</b>。
          标题、正文、附件、卡片 id 都不会离开这台机器。
        </p>
      </div>
    </aside>
  )
}
