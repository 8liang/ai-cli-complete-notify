import { invoke } from '@tauri-apps/api/core';

export function hideToTray() {
  return invoke<void>('hide_to_tray');
}
