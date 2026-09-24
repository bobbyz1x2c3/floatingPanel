import type { BoardState, CardData, Settings, ZoneSize } from './types'

export type PluginMode = 'desktop' | 'focus'

export interface PluginCardInput {
  title?: string
  body?: string
  quadrant?: CardData['quadrant']
  x?: number
  y?: number
  width?: number
  height?: number
  attachments?: CardData['attachments']
}

export interface PluginStateSnapshot {
  state: BoardState
  zone: ZoneSize
  mode: PluginMode
  currentCardId: string | null
  pomodoro: { cardId: string; endsAt: number; remaining: number; label: string } | null
}

export type PluginIconName = 'users' | 'sparkle' | 'layers' | 'link' | 'external' | 'grid' | 'circle'

export interface PluginTopbarButtonRegistration {
  id: string
  label?: string
  title?: string
  icon?: PluginIconName
  panelId?: string
  onClick?: (context: PluginContext) => void
}

export interface PluginOverlayRegistration {
  id: string
  layer?: 'background' | 'top'
  mount: (container: HTMLElement, context: PluginContext) => void | (() => void)
}

export interface PluginPanelRegistration {
  id: string
  title?: string
  width?: number
  className?: string
  mount: (container: HTMLElement, context: PluginContext) => void | (() => void)
}

export interface PluginContext {
  pluginId: string
  getSnapshot(): PluginStateSnapshot
  subscribe(listener: (snapshot: PluginStateSnapshot) => void): () => void
  addCard(input?: PluginCardInput): string | null
  updateCard(id: string, patch: Partial<CardData>): void
  removeCard(id: string): void
  archiveCard(id: string): void
  setActiveCard(id: string | null): void
  setSettings(patch: Partial<Settings>): void
  notify(message: string): void
  registerTopbarButton(button: PluginTopbarButtonRegistration): () => void
  registerOverlay(overlay: PluginOverlayRegistration): () => void
  registerPanel(panel: PluginPanelRegistration): () => void
  openPanel(panelId: string): void
  closePanel(): void
}

export interface PluginDefinition {
  id: string
  name: string
  version?: string
  setup: (context: PluginContext) => void | (() => void) | Promise<void | (() => void)>
}

export interface PluginDescriptor {
  id: string
  name: string
  version?: string
  status: 'loading' | 'active' | 'error'
  error?: string
}

export interface PluginHostBridge {
  addCard(input?: PluginCardInput): string | null
  updateCard(id: string, patch: Partial<CardData>): void
  removeCard(id: string): void
  archiveCard(id: string): void
  setActiveCard(id: string | null): void
  setSettings(patch: Partial<Settings>): void
  notify(message: string): void
}

export interface PluginRuntimeApi {
  register(definition: PluginDefinition): () => void
  load(url: string): Promise<() => void>
  unload(id: string): Promise<void>
  list(): PluginDescriptor[]
  getSnapshot(): PluginStateSnapshot
  subscribe(listener: (snapshot: PluginStateSnapshot) => void): () => void
  openPanel(panelId: string): void
  closePanel(): void
  isPanelOpen(panelId: string): boolean
}

declare global {
  interface Window {
    NemuFloatPlugins?: PluginRuntimeApi
  }
}
