import { useState } from 'react'
import { NeuButton, NeuChip, NeuField, NeuSlider, NeuSwitch, DrawerRow } from './controls'
import { IconClose, IconEraser, IconGrid, IconRestore } from './icons'
import { formatPercent } from '../lib/format'
import { TONES, TONE_LABELS, TRAY_ACTIONS, TRAY_KIND_LABELS } from '../lib/types'
import type { CardTone, Settings, ThemeMode, TrayTool, TrayToolKind } from '../lib/types'
import type { UpdateState } from '../lib/update'

export interface SettingsDrawerProps {
  settings: Settings
  isDesktop: boolean
  onPatch: (patch: Partial<Settings>) => void
  onArrange: () => void
  onCollapseAll: () => void
  onClear: () => void
  onRestore: () => void
  version: string
  update: UpdateState
  onCheckUpdate: () => void
  onInstallUpdate: () => void
  onClose: () => void
}

function updateSummary(state: UpdateState, version: string): string {
  switch (state.status) {
    case 'idle':
      return `当前版本 ${version}`
    case 'checking':
      return '正在检查…'
    case 'latest':
      return `已是最新（${version}）`
    case 'available':
      return `发现新版本 ${state.version}`
    case 'installing':
      return `正在下载安装 ${state.percent}%`
    case 'error':
      return `检查失败：${state.message}`
    default:
      return `当前版本 ${version}`
  }
}

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

export function SettingsDrawer({
  settings,
  isDesktop,
  onPatch,
  onArrange,
  onCollapseAll,
  onClear,
  onRestore,
  version,
  update,
  onCheckUpdate,
  onInstallUpdate,
  onClose,
}: SettingsDrawerProps) {
  // 新增托盘工具的小表单
  const [toolIcon, setToolIcon] = useState('🧰')
  const [toolLabel, setToolLabel] = useState('')
  const [toolKind, setToolKind] = useState<TrayToolKind>('action')
  const [toolValue, setToolValue] = useState(TRAY_ACTIONS[0].value)

  const addTool = () => {
    const label = toolLabel.trim() || TRAY_ACTIONS.find((a) => a.value === toolValue)?.label || '新工具'
    const value = toolValue.trim()
    if (!value) return
    const tool: TrayTool = {
      id: `tool-${Date.now().toString(36)}`,
      icon: toolIcon.trim().slice(0, 2) || '🧰',
      label: label.slice(0, 24),
      kind: toolKind,
      value,
    }
    onPatch({ trayTools: [...settings.trayTools, tool] })
    setToolLabel('')
  }

  return (
    <aside className="drawer nm-scroll" aria-label="设置面板">
      <div className="drawer__head">
        <h2 className="drawer__title">外观与窗口</h2>
        <NeuButton iconOnly size="sm" aria-label="关闭设置" title="关闭设置" onClick={onClose}>
          <IconClose size={15} />
        </NeuButton>
      </div>

      <hr className="nm-divider" />

      <div className="drawer__group">
        <span className="nm-label">主题模式</span>
        <div className="drawer__chips">
          {THEME_OPTIONS.map((option) => (
            <NeuChip
              key={option.value}
              active={settings.theme === option.value}
              onClick={() => onPatch({ theme: option.value })}
            >
              {option.label}
            </NeuChip>
          ))}
        </div>
      </div>

      <div className="drawer__group">
        <span className="nm-label">强调色</span>
        <div className="drawer__chips">
          {TONES.map((tone: CardTone) => (
            <NeuChip
              key={tone}
              tone={tone}
              active={settings.accent === tone}
              onClick={() => onPatch({ accent: tone })}
            >
              {TONE_LABELS[tone]}
            </NeuChip>
          ))}
        </div>
      </div>

      <hr className="nm-divider" />

      <div className="drawer__group">
        <span className="nm-label">质感</span>
        <DrawerRow
          title="背景透明度"
          hint={`${Math.round(settings.bgTransparency * 100)}% · 只影响面板底色`}
        >
          <span style={{ width: 132 }}>
            <NeuSlider
              min={0}
              max={85}
              step={1}
              value={Math.round(settings.bgTransparency * 100)}
              aria-label="背景透明度"
              onChange={(event) => onPatch({ bgTransparency: Number(event.target.value) / 100 })}
            />
          </span>
        </DrawerRow>
        <DrawerRow title="颗粒质感" hint={formatPercent(settings.grain / 0.9)}>
          <span style={{ width: 132 }}>
            <NeuSlider
              min={0}
              max={90}
              step={5}
              value={Math.round(settings.grain * 100)}
              aria-label="颗粒质感"
              onChange={(event) => onPatch({ grain: Number(event.target.value) / 100 })}
            />
          </span>
        </DrawerRow>
        <DrawerRow title="磨砂强度" hint={`${Math.round(settings.frost)}%`}>
          <span style={{ width: 132 }}>
            <NeuSlider
              min={0}
              max={100}
              step={2}
              value={settings.frost}
              aria-label="磨砂强度"
              onChange={(event) => onPatch({ frost: Number(event.target.value) })}
            />
          </span>
        </DrawerRow>
        <DrawerRow title="对齐网格" hint="拖动时吸附到 26px 网格">
          <NeuSwitch
            label="对齐网格"
            checked={settings.snapToGrid}
            onChange={(value) => onPatch({ snapToGrid: value })}
          />
        </DrawerRow>
        <DrawerRow title="显示网格" hint="在画布上显示浅色网格点">
          <NeuSwitch
            label="显示网格"
            checked={settings.showGrid}
            onChange={(value) => onPatch({ showGrid: value })}
          />
        </DrawerRow>
        <DrawerRow title="完成音效" hint="归档卡片时播一声轻响">
          <NeuSwitch
            label="完成音效"
            checked={settings.soundOnComplete}
            onChange={(value) => onPatch({ soundOnComplete: value })}
          />
        </DrawerRow>
        <DrawerRow
          title="音频响应"
          hint={isDesktop ? '跟着电脑正在播放的声音做频谱动效' : '仅桌面端可用'}
        >
          <NeuSwitch
            label="音频响应"
            checked={settings.audioReactive}
            disabled={!isDesktop}
            onChange={(value) => onPatch({ audioReactive: value })}
          />
        </DrawerRow>
      </div>

      <hr className="nm-divider" />

      <div className="drawer__group">
        <span className="nm-label">窗口行为</span>
        <DrawerRow
          title="窗口置顶"
          hint={isDesktop ? '让悬浮窗始终浮在其它窗口之上' : '仅桌面端可用'}
        >
          <NeuSwitch
            label="窗口置顶"
            checked={settings.alwaysOnTop}
            disabled={!isDesktop}
            onChange={(value) => onPatch({ alwaysOnTop: value })}
          />
        </DrawerRow>
      </div>

      <hr className="nm-divider" />

      <div className="drawer__group">
        <span className="nm-label">番茄钟</span>
        <DrawerRow title="小番茄" hint={`${settings.pomodoroShort} 分钟`}>
          <span style={{ width: 132 }}>
            <NeuSlider
              min={5}
              max={60}
              step={5}
              value={settings.pomodoroShort}
              aria-label="小番茄时长"
              onChange={(event) => onPatch({ pomodoroShort: Number(event.target.value) })}
            />
          </span>
        </DrawerRow>
        <DrawerRow title="大番茄" hint={`${settings.pomodoroLong} 分钟`}>
          <span style={{ width: 132 }}>
            <NeuSlider
              min={5}
              max={120}
              step={5}
              value={settings.pomodoroLong}
              aria-label="大番茄时长"
              onChange={(event) => onPatch({ pomodoroLong: Number(event.target.value) })}
            />
          </span>
        </DrawerRow>
      </div>

      <hr className="nm-divider" />

      <div className="drawer__group">
        <span className="nm-label">托盘工具</span>
        <p className="drawer__note">
          挂在下方托盘上的快捷方式：内置动作、打开链接 / 文件，或者执行一条命令（命令直接交给系统跑，只填自己信得过的）。
        </p>

        {settings.trayTools.length > 0 ? (
          <ul className="tray-list">
            {settings.trayTools.map((tool) => (
              <li key={tool.id} className="tray-list__item">
                <span className="tray-list__icon" aria-hidden="true">
                  {tool.icon}
                </span>
                <span className="tray-list__meta">
                  <b>{tool.label}</b>
                  <em>
                    {TRAY_KIND_LABELS[tool.kind]} · {tool.value}
                  </em>
                </span>
                <NeuButton
                  iconOnly
                  size="sm"
                  variant="danger"
                  aria-label={`移除 ${tool.label}`}
                  title="移除"
                  onClick={() =>
                    onPatch({ trayTools: settings.trayTools.filter((item) => item.id !== tool.id) })
                  }
                >
                  <IconClose size={14} />
                </NeuButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="drawer__note">还没有工具，下面加一个试试。</p>
        )}

        <div className="tray-form">
          <div className="tray-form__row">
            <NeuField
              className="tray-form__icon"
              value={toolIcon}
              maxLength={2}
              aria-label="工具图标"
              title="一个 emoji 或一两个字符"
              onChange={(event) => setToolIcon(event.target.value)}
            />
            <NeuField
              value={toolLabel}
              placeholder="名称，例如 打开项目"
              aria-label="工具名称"
              onChange={(event) => setToolLabel(event.target.value)}
            />
          </div>
          <div className="drawer__chips">
            {(Object.keys(TRAY_KIND_LABELS) as TrayToolKind[]).map((kind) => (
              <NeuChip
                key={kind}
                active={toolKind === kind}
                onClick={() => {
                  setToolKind(kind)
                  setToolValue(kind === 'action' ? TRAY_ACTIONS[0].value : '')
                }}
              >
                {TRAY_KIND_LABELS[kind]}
              </NeuChip>
            ))}
          </div>
          {toolKind === 'action' ? (
            <div className="drawer__chips">
              {TRAY_ACTIONS.map((action) => (
                <NeuChip
                  key={action.value}
                  active={toolValue === action.value}
                  onClick={() => setToolValue(action.value)}
                >
                  {action.label}
                </NeuChip>
              ))}
            </div>
          ) : (
            <NeuField
              value={toolValue}
              placeholder={toolKind === 'open' ? 'https://… 或 D:\\某个文件' : '例如 code D:\\项目'}
              aria-label="工具内容"
              onChange={(event) => setToolValue(event.target.value)}
            />
          )}
          <div className="drawer__actions">
            <NeuButton size="sm" disabled={!toolValue.trim()} onClick={addTool}>
              加到托盘
            </NeuButton>
          </div>
        </div>
      </div>

      <hr className="nm-divider" />

      <div className="drawer__group">
        <span className="nm-label">更新</span>
        <DrawerRow title="版本" hint={updateSummary(update, version)}>
          <div className="drawer__inline">
            {update.status === 'available' ? (
              <NeuButton size="sm" variant="primary" onClick={onInstallUpdate}>
                下载并安装
              </NeuButton>
            ) : (
              <NeuButton
                size="sm"
                disabled={!isDesktop || update.status === 'checking' || update.status === 'installing'}
                onClick={onCheckUpdate}
              >
                {update.status === 'checking' ? '检查中…' : '检查更新'}
              </NeuButton>
            )}
          </div>
        </DrawerRow>
        <DrawerRow title="自动检查更新" hint="启动后自动问一次，有新版本会提示">
          <NeuSwitch
            label="自动检查更新"
            checked={settings.autoCheckUpdate}
            disabled={!isDesktop}
            onChange={(value) => onPatch({ autoCheckUpdate: value })}
          />
        </DrawerRow>
      </div>

      <hr className="nm-divider" />

      <div className="drawer__group">
        <span className="nm-label">布局操作</span>
        <div className="drawer__actions">
          <NeuButton size="sm" onClick={onArrange}>
            <IconGrid size={15} />
            整理布局
          </NeuButton>
          <NeuButton size="sm" onClick={onCollapseAll}>
            收起全部
          </NeuButton>
          <NeuButton size="sm" onClick={onRestore}>
            <IconRestore size={15} />
            恢复示例
          </NeuButton>
          <NeuButton size="sm" variant="danger" onClick={onClear}>
            <IconEraser size={15} />
            清空卡片
          </NeuButton>
        </div>
      </div>
    </aside>
  )
}
