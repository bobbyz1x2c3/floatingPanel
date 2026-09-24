import { createInitialState } from './store'
import { zoneSizeFor } from './types'
import type {
  PluginContext,
  PluginDefinition,
  PluginDescriptor,
  PluginHostBridge,
  PluginOverlayRegistration,
  PluginPanelRegistration,
  PluginRuntimeApi,
  PluginStateSnapshot,
} from './pluginTypes'

type SlotKind = 'topbar' | 'overlay' | 'panel'
type SlotRecord = { owner: string; value: { id: string } }
type PluginRecord = {
  definition: PluginDefinition
  status: PluginDescriptor['status']
  error?: string
  cleanup?: () => void
  cancelled?: boolean
}

const slots: Record<SlotKind, SlotRecord[]> = { topbar: [], overlay: [], panel: [] }
const slotListeners = new Set<() => void>()
const stateListeners = new Set<(snapshot: PluginStateSnapshot) => void>()
const contexts = new Map<string, PluginContext>()
const records = new Map<string, PluginRecord>()
const queuedActions: Array<(host: PluginHostBridge) => void> = []

let host: PluginHostBridge | null = null
let activePanelId: string | null = null
let snapshot: PluginStateSnapshot = {
  state: createInitialState(),
  zone: zoneSizeFor(window.innerWidth - 32, window.innerHeight - 132),
  mode: 'desktop',
  currentCardId: null,
  pomodoro: null,
}

function notifySlots() {
  for (const listener of slotListeners) {
    try { listener() } catch (error) { console.error('插件插槽监听器出错', error) }
  }
}

function notifyState() {
  for (const listener of stateListeners) {
    try { listener(snapshot) } catch (error) { console.error('插件状态监听器出错', error) }
  }
}

function runHost(action: (bridge: PluginHostBridge) => void) {
  if (host) action(host)
  else queuedActions.push(action)
}

function removeSlots(owner: string) {
  let changed = false
  for (const kind of Object.keys(slots) as SlotKind[]) {
    const before = slots[kind].length
    slots[kind] = slots[kind].filter((slot) => slot.owner !== owner)
    changed ||= before !== slots[kind].length
  }
  if (activePanelId && !slots.panel.some((slot) => slot.value.id === activePanelId)) activePanelId = null
  if (changed) notifySlots()
}

function registerSlot<T extends { id: string }>(kind: SlotKind, owner: string, value: T) {
  if (slots[kind].some((slot) => slot.owner === owner && slot.value.id === value.id)) {
    throw new Error(`插件 ${owner} 已经注册了同名 ${kind} 插槽：${value.id}`)
  }
  slots[kind].push({ owner, value })
  notifySlots()
  return () => {
    const index = slots[kind].findIndex((slot) => slot.owner === owner && slot.value.id === value.id)
    if (index < 0) return
    slots[kind].splice(index, 1)
    if (activePanelId === value.id) activePanelId = null
    notifySlots()
  }
}

function openPluginPanel(panelId: string) {
  if (!slots.panel.some((slot) => slot.value.id === panelId) || activePanelId === panelId) return
  activePanelId = panelId
  notifySlots()
}

function closePluginPanel() {
  if (!activePanelId) return
  activePanelId = null
  notifySlots()
}

function contextFor(pluginId: string): PluginContext {
  const cached = contexts.get(pluginId)
  if (cached) return cached
  const context: PluginContext = {
    pluginId,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      stateListeners.add(listener)
      return () => { stateListeners.delete(listener) }
    },
    addCard: (input) => {
      let id: string | null = null
      runHost((bridge) => { id = bridge.addCard(input) })
      return id
    },
    updateCard: (id, patch) => runHost((bridge) => bridge.updateCard(id, patch)),
    removeCard: (id) => runHost((bridge) => bridge.removeCard(id)),
    archiveCard: (id) => runHost((bridge) => bridge.archiveCard(id)),
    setActiveCard: (id) => runHost((bridge) => bridge.setActiveCard(id)),
    setSettings: (patch) => runHost((bridge) => bridge.setSettings(patch)),
    notify: (message) => runHost((bridge) => bridge.notify(message)),
    registerTopbarButton: (button) => registerSlot('topbar', pluginId, button),
    registerOverlay: (overlay) => registerSlot('overlay', pluginId, overlay),
    registerPanel: (panel) => registerSlot('panel', pluginId, panel),
    openPanel: openPluginPanel,
    closePanel: closePluginPanel,
  }
  contexts.set(pluginId, context)
  return context
}

async function startPlugin(record: PluginRecord) {
  try {
    const cleanup = await record.definition.setup(contextFor(record.definition.id))
    if (record.cancelled) {
      if (typeof cleanup === 'function') cleanup()
      return
    }
    record.cleanup = typeof cleanup === 'function' ? cleanup : undefined
    record.status = 'active'
  } catch (error) {
    record.status = 'error'
    record.error = error instanceof Error ? error.message : String(error)
    removeSlots(record.definition.id)
    console.error(`插件 ${record.definition.id} 启动失败`, error)
  }
}

function validateDefinition(definition: PluginDefinition) {
  if (!definition || typeof definition.id !== 'string' || !definition.id.trim()) throw new Error('插件缺少 id')
  if (typeof definition.setup !== 'function') throw new Error(`插件 ${definition.id} 缺少 setup()`)
}

function registerPlugin(definition: PluginDefinition) {
  validateDefinition(definition)
  if (records.has(definition.id)) throw new Error(`插件已存在：${definition.id}`)
  const record: PluginRecord = { definition, status: 'loading' }
  records.set(definition.id, record)
  void startPlugin(record)
  return () => { void unloadPlugin(definition.id) }
}

async function unloadPlugin(id: string) {
  const record = records.get(id)
  if (!record) return
  record.cancelled = true
  records.delete(id)
  try {
    await record.cleanup?.()
  } catch (error) {
    console.error(`插件 ${id} 卸载失败`, error)
  } finally {
    removeSlots(id)
    contexts.delete(id)
  }
}

async function loadPlugin(url: string) {
  const resolved = new URL(url, window.location.href).href
  const module = (await import(/* @vite-ignore */ resolved)) as Record<string, unknown>
  const candidate = module.default ?? module.plugin ?? module
  const definition = typeof candidate === 'function'
    ? ((await candidate()) as PluginDefinition)
    : (candidate as PluginDefinition)
  return registerPlugin(definition)
}

function bindPluginHost(nextHost: PluginHostBridge) {
  host = nextHost
  const queued = queuedActions.splice(0)
  for (const action of queued) action(nextHost)
  return () => { if (host === nextHost) host = null }
}

function listPlugins(): PluginDescriptor[] {
  return [...records.values()].map((record) => ({
    id: record.definition.id,
    name: record.definition.name,
    version: record.definition.version,
    status: record.status,
    error: record.error,
  }))
}

export const pluginRuntime: PluginRuntimeApi = {
  register: registerPlugin,
  load: loadPlugin,
  unload: unloadPlugin,
  list: listPlugins,
  getSnapshot: () => snapshot,
  subscribe: (listener) => {
    stateListeners.add(listener)
    return () => { stateListeners.delete(listener) }
  },
  openPanel: openPluginPanel,
  closePanel: closePluginPanel,
  isPanelOpen: (panelId) => activePanelId === panelId,
}

export function exposePluginRuntime() {
  const target = window as Window & { NemuFloatPlugins?: PluginRuntimeApi }
  target.NemuFloatPlugins = pluginRuntime
}

export function getPluginContext(pluginId: string) { return contextFor(pluginId) }
export function getPluginSlots<T>(kind: SlotKind) {
  return slots[kind].map((slot) => ({ owner: slot.owner, value: slot.value as T }))
}
export function getPluginOverlays(layer: 'background' | 'top') {
  return getPluginSlots<PluginOverlayRegistration>('overlay')
    .filter((entry) => (entry.value.layer ?? 'background') === layer)
}
export function getPluginPanel() {
  if (!activePanelId) return null
  return getPluginSlots<PluginPanelRegistration>('panel')
    .find((entry) => entry.value.id === activePanelId) ?? null
}
export function subscribePluginSlots(listener: () => void) {
  slotListeners.add(listener)
  return () => { slotListeners.delete(listener) }
}
export function updatePluginSnapshot(next: PluginStateSnapshot) {
  snapshot = next
  notifyState()
}
export { bindPluginHost, openPluginPanel, closePluginPanel }
