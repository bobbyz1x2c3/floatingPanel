import tomatoSmall from '../../assets/tomato-small.png'
import tomatoBig from '../../assets/tomato-big.png'
import { TOMATO_MIME } from '../lib/pomodoro'
import { TRAY_KIND_LABELS } from '../lib/types'
import type { TrayTool } from '../lib/types'
import { NeuButton } from './controls'
import { IconClose } from './icons'

export interface TomatoBarProps {
  shortMinutes: number
  longMinutes: number
  /** 正在跑的番茄钟：显示剩余时间和取消按钮。 */
  runningLabel: string | null
  runningClock: string | null
  /** 托盘上的快捷方式。 */
  tools: TrayTool[]
  onRunTool: (tool: TrayTool) => void
  onEditTools: () => void
  onCancel: () => void
}

/** 一颗可以拖走的番茄。拖到卡片上就开始计时。 */
function Tomato({
  src,
  minutes,
  label,
  small,
}: {
  src: string
  minutes: number
  label: string
  small?: boolean
}) {
  return (
    <div
      className="tomato"
      draggable
      title={`拖到某张卡片上，开始 ${minutes} 分钟`}
      onDragStart={(event) => {
        event.dataTransfer.setData(TOMATO_MIME, JSON.stringify({ minutes, label }))
        event.dataTransfer.effectAllowed = 'copy'
      }}
    >
      <img className={`tomato__img${small ? ' is-small' : ''}`} src={src} alt="" draggable={false} />
      <span className="tomato__text">
        <b>{label}</b>
        <em>{minutes} 分钟</em>
      </span>
    </div>
  )
}

/**
 * 界面下方的浮动托盘：两颗可以拖到卡片上的番茄，右侧挂自定义的快捷方式，
 * 计时中时再显示剩余时间和取消。
 */
export function TomatoBar({
  shortMinutes,
  longMinutes,
  runningLabel,
  runningClock,
  tools,
  onRunTool,
  onEditTools,
  onCancel,
}: TomatoBarProps) {
  return (
    <div className="tomatoes" role="group" aria-label="番茄钟与工具">
      <Tomato src={tomatoSmall} minutes={shortMinutes} label="小番茄" small />
      <Tomato src={tomatoBig} minutes={longMinutes} label="大番茄" />

      {tools.length > 0 ? (
        <>
          <span className="tomatoes__rule" aria-hidden="true" />
          <div className="tray-tools">
            {tools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className="tray-tool"
                title={`${tool.label} · ${TRAY_KIND_LABELS[tool.kind]}`}
                aria-label={tool.label}
                onClick={() => onRunTool(tool)}
              >
                <span className="tray-tool__icon" aria-hidden="true">
                  {tool.icon}
                </span>
              </button>
            ))}
            <button
              type="button"
              className="tray-tool tray-tool--ghost"
              title="在设置里管理托盘工具"
              aria-label="管理托盘工具"
              onClick={onEditTools}
            >
              <span className="tray-tool__icon" aria-hidden="true">
                ＋
              </span>
            </button>
          </div>
        </>
      ) : null}

      {runningClock ? (
        <>
          <span className="tomatoes__rule" aria-hidden="true" />
          <span className="tomatoes__running" title={`${runningLabel} 进行中`}>
            <img className="tomato__img is-small" src={tomatoSmall} alt="" aria-hidden="true" />
            {runningClock}
          </span>
          <NeuButton size="sm" aria-label="取消番茄钟" title="取消这个番茄钟" onClick={onCancel}>
            <IconClose size={14} />
            取消
          </NeuButton>
        </>
      ) : tools.length === 0 ? (
        <span className="tomatoes__hint">拖到卡片上开始计时</span>
      ) : null}
    </div>
  )
}
