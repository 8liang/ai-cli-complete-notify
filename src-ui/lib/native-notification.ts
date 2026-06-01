import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

export const NATIVE_DESKTOP_NOTIFICATION_PREFIX = '__AI_CLI_COMPLETE_NOTIFY_DESKTOP__';

type NativeNotificationPayload = {
  title?: unknown;
  body?: unknown;
};

let permissionKnown: boolean | null = null;
let permissionRequest: Promise<boolean> | null = null;

async function ensureNotificationPermission() {
  if (permissionKnown !== null) return permissionKnown;
  if (permissionRequest) return permissionRequest;

  permissionRequest = (async () => {
    try {
      if (await isPermissionGranted()) {
        permissionKnown = true;
        return true;
      }

      const permission = await requestPermission();
      permissionKnown = permission === 'granted';
      return permissionKnown;
    } catch (error) {
      permissionKnown = false;
      console.error('native notification permission failed:', error);
      return false;
    } finally {
      permissionRequest = null;
    }
  })();

  return permissionRequest;
}

export async function sendNativeDesktopNotification(payload: NativeNotificationPayload) {
  const allowed = await ensureNotificationPermission();
  if (!allowed) return;

  const title = String(payload.title || 'AI CLI Complete Notify');
  const body = String(payload.body || '');
  sendNotification({ title, body });
}

export function dispatchNativeNotificationLine(line: string) {
  const text = String(line || '').trim();
  if (!text.startsWith(NATIVE_DESKTOP_NOTIFICATION_PREFIX)) return false;

  try {
    const payload = JSON.parse(text.slice(NATIVE_DESKTOP_NOTIFICATION_PREFIX.length));
    void sendNativeDesktopNotification(payload);
  } catch (error) {
    console.error('native notification payload failed:', error);
  }

  return true;
}

export function filterNativeNotificationOutput(output: string) {
  const visibleLines: string[] = [];

  for (const line of String(output || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!dispatchNativeNotificationLine(line)) visibleLines.push(line);
  }

  return visibleLines.join('\n');
}
