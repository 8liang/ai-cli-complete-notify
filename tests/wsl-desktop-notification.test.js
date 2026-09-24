const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { notifyDesktopBalloon, supportsDesktopNotifications } = require('../src/notifiers/desktop');

test('desktop notifications support WSL without enabling pure Linux', () => {
  assert.equal(supportsDesktopNotifications('linux', true), true);
  assert.equal(supportsDesktopNotifications('linux', false), false);
  assert.equal(supportsDesktopNotifications('win32', false), true);
  assert.equal(supportsDesktopNotifications('darwin', false), true);
});

test('WSL desktop notifications invoke Windows PowerShell', async (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-notify-wsl-'));
  const powershell = path.join(fixture, 'powershell.exe');
  fs.writeFileSync(powershell, '#!/bin/sh\nprintf "MODE:TOAST\\n"\n', { mode: 0o755 });

  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const originalPath = process.env.PATH;
  const originalDistro = process.env.WSL_DISTRO_NAME;
  t.after(() => {
    Object.defineProperty(process, 'platform', platform);
    process.env.PATH = originalPath;
    if (originalDistro == null) delete process.env.WSL_DISTRO_NAME;
    else process.env.WSL_DISTRO_NAME = originalDistro;
    fs.rmSync(fixture, { recursive: true, force: true });
  });

  Object.defineProperty(process, 'platform', { ...platform, value: 'linux' });
  process.env.WSL_DISTRO_NAME = 'Ubuntu';
  process.env.PATH = `${fixture}${path.delimiter}${originalPath || ''}`;

  const result = await notifyDesktopBalloon({
    title: 'WSL test',
    message: 'Task finished',
    timeoutMs: 1200,
    kind: 'complete',
    projectName: 'demo',
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'toast');
});
