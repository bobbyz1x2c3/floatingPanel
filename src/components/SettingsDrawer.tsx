import { NeuButton, NeuChip, NeuSlider, NeuSwitch, DrawerRow } from './controls'
import { IconClose, IconEraser, IconGrid, IconRestore } from './icons'
import { formatPercent } from '../lib/format'
import { TONES, TONE_LABELS } from '../lib/types'
import type { CardTone, Settings, ThemeMode } from '../lib/types'

export interface SettingsDrawerProps {
  settings: Settings
  isDesktop: boolean
  onPatch: (patch: Partial<Settings>) => void
  onArrange: () => void
  onCollapseAll: () => void
  onClear: () => void
  onRestore: () => void
  onClose: () => void
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
  onClose,
}: SettingsDrawerProps) {
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
        <DrawerRow title="面板透明度" hint={formatPercent(settings.panelOpacity)}>
          <span style={{ width: 132 }}>
            <NeuSlider
              min={55}
              max={100}
              step={1}
              value={Math.round(settings.panelOpacity * 100)}
              aria-label="面板透明度"
              onChange={(event) => onPatch({ panelOpacity: Number(event.target.value) / 100 })}
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
        <DrawerRow
          title="毛玻璃背景"
          hint={isDesktop ? '使用系统亚克力材质（部分平台支持）' : '仅桌面端可用'}
        >
          <NeuSwitch
            label="毛玻璃背景"
            checked={settings.blurBehind}
            disabled={!isDesktop}
            onChange={(value) => onPatch({ blurBehind: value })}
          />
        </DrawerRow>
        <DrawerRow title="失焦自动淡化" hint="切换到其它窗口时降低面板不透明度">
          <NeuSwitch
            label="失焦自动淡化"
            checked={settings.dimOnBlur}
            onChange={(value) => onPatch({ dimOnBlur: value })}
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
