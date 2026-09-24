import { useEffect, useRef, useState } from 'react'
import { NeuButton } from './controls'
import { IconCircle, IconExternal, IconGrid, IconLayers, IconLink, IconSparkle, IconUsers, IconClose } from './icons'
import type {
  PluginIconName,
  PluginOverlayRegistration,
  PluginPanelRegistration,
  PluginTopbarButtonRegistration,
} from '../lib/pluginTypes'
import {
  getPluginContext,
  getPluginPanel,
  getPluginSlots,
  openPluginPanel,
  subscribePluginSlots,
} from '../lib/pluginRuntime'

type SlotKind = 'topbar' | 'overlay' | 'panel'

function useSlots<T>(kind: SlotKind) {
  const [entries, setEntries] = useState(() => getPluginSlots<T>(kind))
  useEffect(() => {
    const unsubscribe = subscribePluginSlots(() => setEntries(getPluginSlots<T>(kind)))
    return () => { unsubscribe() }
  }, [kind])
  return entries
}

function PluginMount({
  owner,
  registration,
}: {
  owner: string
  registration: PluginOverlayRegistration | PluginPanelRegistration
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    try {
      const cleanup = registration.mount(container, getPluginContext(owner))
      return typeof cleanup === 'function' ? cleanup : undefined
    } catch (error) {
      console.error(`插件 ${owner} 的视图挂载失败`, error)
    }
  }, [owner, registration])
  return <div className="plugin-mount" ref={containerRef} />
}

const ICONS: Record<PluginIconName, typeof IconUsers> = {
  users: IconUsers,
  sparkle: IconSparkle,
  layers: IconLayers,
  link: IconLink,
  external: IconExternal,
  grid: IconGrid,
  circle: IconCircle,
}

export function PluginTopbarButtons() {
  const entries = useSlots<PluginTopbarButtonRegistration>('topbar')
  if (entries.length === 0) return null
  return (
    <div className="topbar__plugins">
      {entries.map(({ owner, value }) => {
        const Icon = ICONS[value.icon ?? 'sparkle']
        return (
          <NeuButton
            key={`${owner}:${value.id}`}
            size="sm"
            iconOnly={!value.label}
            aria-label={value.label ?? value.title ?? value.id}
            title={value.title ?? value.label ?? value.id}
            onClick={() => {
              try {
                value.onClick?.(getPluginContext(owner))
              } catch (error) {
                console.error(`插件 ${owner} 的顶栏按钮出错`, error)
              }
              if (value.panelId) openPluginPanel(value.panelId)
            }}
          >
            <Icon size={16} />
            {value.label ? <span className="topbar__plugin-label">{value.label}</span> : null}
          </NeuButton>
        )
      })}
    </div>
  )
}

export function PluginOverlayLayer({ layer }: { layer: 'background' | 'top' }) {
  const entries = useSlots<PluginOverlayRegistration>('overlay').filter(
    (entry) => (entry.value.layer ?? 'background') === layer,
  )
  if (entries.length === 0) return null
  return (
    <div className={`plugin-layer plugin-layer--${layer}`} aria-hidden="true">
      {entries.map(({ owner, value }) => (
        <PluginMount key={`${owner}:${value.id}`} owner={owner} registration={value} />
      ))}
    </div>
  )
}

export function PluginPanelLayer() {
  useSlots<PluginPanelRegistration>('panel')
  const entry = getPluginPanel()
  if (!entry) return null
  const panel = entry.value
  return (
    <aside
      className={`drawer drawer--plugin ${panel.className ?? ''}`}
      style={panel.width ? { width: `min(${panel.width}px, calc(100% - 32px))` } : undefined}
      aria-label={panel.title ?? '插件面板'}
    >
      <div className="drawer__head">
        <h2 className="drawer__title">{panel.title ?? '插件'}</h2>
        <NeuButton iconOnly size="sm" aria-label="关闭插件面板" title="关闭" onClick={() => getPluginContext(entry.owner).closePanel()}>
          <IconClose size={15} />
        </NeuButton>
      </div>
      <hr className="nm-divider" />
      <PluginMount owner={entry.owner} registration={panel} />
    </aside>
  )
}
