import { isDesktop } from './platform'
import { parseState } from './storage'
import type { BoardState } from './types'

/**
 * 桌面端的状态文件（`board.json`）。
 *
 * 界面和 CLI（`nemu`）共用这一份：界面每次改动写进去，CLI 直接改文件，
 * 界面再靠比对修改时间把 CLI 的改动捞回来，两边不需要常驻进程通信。
 */

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isDesktop) return null
  try {
    const core = await import('@tauri-apps/api/core')
    return (await core.invoke<T>(command, args)) ?? null
  } catch {
    return null
  }
}

/** 和 localStorage 那份一致：不把 activeId 写进文件。 */
export function serializeBoard(state: BoardState): string {
  return JSON.stringify({ ...state, activeId: undefined })
}

export async function readBoardFile(): Promise<string | null> {
  return invoke<string>('read_board_file')
}

export async function writeBoardFile(state: BoardState): Promise<number | null> {
  return invoke<number>('write_board_file', { contents: serializeBoard(state) })
}

export async function boardFileStamp(): Promise<number> {
  return (await invoke<number>('board_file_stamp')) ?? 0
}

export function parseBoardFile(raw: string): BoardState | null {
  try {
    return parseState(JSON.parse(raw))
  } catch {
    return null
  }
}
