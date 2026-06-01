const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('close dialog hide action delegates to the native hide_to_tray command', () => {
  const appSource = fs.readFileSync(path.join(root, 'src-ui', 'App.tsx'), 'utf8');
  const rustSource = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');

  assert.match(appSource, /hideToTray\(\)/);
  assert.doesNotMatch(appSource, /if \(action === 'tray'\) \{\s*await appWindow\.hide\(\);/);
  assert.match(rustSource, /fn hide_to_tray\(/);
  assert.match(rustSource, /hide_to_tray/);
});

test('macOS tray hide keeps the app reopenable from dock and menu bar', () => {
  const rustSource = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');

  assert.doesNotMatch(rustSource, /app\.hide\(\)/);
  assert.doesNotMatch(rustSource, /button_state:\s*tauri::tray::MouseButtonState::Up/);
  assert.match(rustSource, /RunEvent::Reopen/);
  assert.match(rustSource, /restore_main_window\(app\)/);
});
