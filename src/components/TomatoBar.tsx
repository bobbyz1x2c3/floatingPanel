import { TOMATO_MIME } from '../lib/pomodoro'
import { NeuButton } from './controls'
import { IconClose } from './icons'

export interface TomatoBarProps {
  shortMinutes: number
  longMinutes: number
  /** 正在跑的番茄钟：显示剩余时间和取消按钮。 */
  runningLabel: string | null
  runningClock: string | null
  onCancel: () => void
}

/** 一颗可以拖走的番茄。拖到卡片上就开始计时。 */
function Tomato({
  minutes,
  label,
  hint,
  onDragStart,
  onDragEnd,
}: {
  minutes: number
  label: string
  hint: string
  onDragStart: () => void
  onDragEnd: () => void
}) {
  return (
    <div
      className="tomato"
      draggable
      title={`拖到某张卡片上，开始 ${minutes} 分钟${hint}`}
      onDragStart={(event) => {
        event.dataTransfer.setData(TOMATO_MIME, JSON.stringify({ minutes, label }))
        event.dataTransfer.effectAllowed = 'copy'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
    >
      <span className="tomato__body" aria-hidden="true">
        <span className="tomato__leaf" />
      </span>
      <span className="tomato__text">
        <b>{label}</b>
        <em>{minutes} 分钟</em>
      </span>
    </div>
  )
}

/**
 * 界面下方的番茄钟浮动面板：两颗可以拖到卡片上的番茄，
 * 计时中时显示剩余时间与取消。
 */
export function TomatoBar({
  shortMinutes,
  longMinutes,
  runningLabel,
  runningClock,
  onCancel,
}: TomatoBarProps) {
  return (
    <div className="tomatoes" role="group" aria-label="番茄钟">
      <Tomato
        minutes={shortMinutes}
        label="小番茄"
        hint=""
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
      <Tomato
        minutes={longMinutes}
        label="大番茄"
        hint=""
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
      {runningClock ? (
        <>
          <span className="tomatoes__rule" aria-hidden="true" />
          <span className="tomatoes__running" title={`${runningLabel} 进行中`}>
            <span className="tomato__body tomato__body--sm" aria-hidden="true" />
            {runningClock}
          </span>
          <NeuButton size="sm" aria-label="取消番茄钟" title="取消这个番茄钟" onClick={onCancel}>
            <IconClose size={14} />
            取消
          </NeuButton>
        </>
      ) : (
        <span className="tomatoes__hint">拖到卡片上开始计时</span>
      )}
    </div>
  )
}
