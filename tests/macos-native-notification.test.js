const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('macOS sidecar can emit desktop notifications as Tauri stdout events', () => {
  const {
    MACOS_DESKTOP_NOTIFICATION_PREFIX,
    getMacOsDesktopNotificationLine,
  } = require('../src/notifiers/desktop');

  const line = getMacOsDesktopNotificationLine({
    finalTitle: 'AI CLI Complete Notify',
    body: 'Task finished',
  });

  assert.equal(line.startsWith(MACOS_DESKTOP_NOTIFICATION_PREFIX), true);
  assert.equal(line.includes('osascript'), false);

  const payload = JSON.parse(line.slice(MACOS_DESKTOP_NOTIFICATION_PREFIX.length));
  assert.deepEqual(payload, {
    title: 'AI CLI Complete Notify',
    body: 'Task finished',
  });
});

test('packaged macOS sidecar enables Tauri stdout notification mode', () => {
  const buildSidecarSource = fs.readFileSync(path.join(root, 'tools', 'build-sidecar.js'), 'utf8');

  assert.match(buildSidecarSource, /export AI_CLI_COMPLETE_NOTIFY_DESKTOP_STDOUT=1/);
});

test('Tauri UI dispatches native notifications and filters marker lines from logs', () => {
  const nativeNotificationPath = path.join(root, 'src-ui', 'lib', 'native-notification.ts');
  const nativeNotificationSource = fs.readFileSync(nativeNotificationPath, 'utf8');
  const watchSource = fs.readFileSync(path.join(root, 'src-ui', 'hooks', 'useWatch.ts'), 'utf8');
  const testPanelSource = fs.readFileSync(path.join(root, 'src-ui', 'components', 'TestPanel.tsx'), 'utf8');
  const cargoSource = fs.readFileSync(path.join(root, 'src-tauri', 'Cargo.toml'), 'utf8');
  const rustSource = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
  const capabilitySource = fs.readFileSync(path.join(root, 'src-tauri', 'capabilities', 'default.json'), 'utf8');

  assert.match(nativeNotificationSource, /@tauri-apps\/plugin-notification/);
  assert.match(nativeNotificationSource, /requestPermission/);
  assert.match(nativeNotificationSource, /sendNotification/);
  assert.match(watchSource, /dispatchNativeNotificationLine/);
  assert.match(testPanelSource, /filterNativeNotificationOutput/);
  assert.match(cargoSource, /tauri-plugin-notification/);
  assert.match(rustSource, /tauri_plugin_notification::init\(\)/);
  assert.match(capabilitySource, /notification:default/);
});
