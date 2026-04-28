const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, { timeoutMs = 3000, intervalMs = 25 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await sleep(intervalMs);
  }
  assert.ok(predicate(), 'condition was not reached before timeout');
}

test('codex tui failure watch ignores recoverable background WARN 403 lines', async (t) => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-reminder-codex-tui-home-'));
  const logPath = path.join(tempHome, 'codex-tui.log');
  fs.writeFileSync(logPath, '', 'utf8');

  const previousEnv = {
    CODEX_TUI_LOG_PATH: process.env.CODEX_TUI_LOG_PATH,
    CODEX_WATCH_BACKEND: process.env.CODEX_WATCH_BACKEND,
    CODEX_SEED_CATCHUP_MS: process.env.CODEX_SEED_CATCHUP_MS,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
  };

  const notifications = [];
  const enginePath = require.resolve('../src/engine');
  const watchPath = require.resolve('../src/watch');
  const originalEngineCache = require.cache[enginePath];
  const originalWatchCache = require.cache[watchPath];

  t.after(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (originalEngineCache) require.cache[enginePath] = originalEngineCache;
    else delete require.cache[enginePath];
    if (originalWatchCache) require.cache[watchPath] = originalWatchCache;
    else delete require.cache[watchPath];
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  process.env.CODEX_TUI_LOG_PATH = logPath;
  process.env.CODEX_WATCH_BACKEND = 'sessions';
  process.env.CODEX_SEED_CATCHUP_MS = '0';
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;

  require.cache[enginePath] = {
    id: enginePath,
    filename: enginePath,
    loaded: true,
    exports: {
      sendNotifications: async (args) => {
        notifications.push(args);
        return { results: [{ ok: true }] };
      },
    },
  };
  delete require.cache[watchPath];
  const { startWatch } = require('../src/watch');

  const logs = [];
  const stop = startWatch({
    sources: ['codex'],
    intervalMs: 50,
    log: (line) => logs.push(line),
    confirmAlert: { enabled: false },
  });
  t.after(() => stop());

  await sleep(250);

  fs.appendFileSync(logPath, [
    'WARN codex_core::plugins::startup_sync: startup remote plugin sync failed; will retry on next app-server start error=remote plugin sync request to https://chatgpt.com/backend-api/plugins/list failed with status 403 Forbidden: <html>',
    'WARN codex_tui::chatwidget: failed to load full apps list; falling back to installed apps snapshot: Failed to load apps: Request failed with status 403 Forbidden: <html>',
    'WARN codex_core::session::turn: failed to load discoverable tool suggestions: request failed with status 403 Forbidden: <html>',
    '',
  ].join('\n'), 'utf8');

  await sleep(350);
  assert.equal(notifications.length, 0, `background WARN should not notify:\n${logs.join('\n')}`);

  fs.appendFileSync(logPath, 'ERROR codex_core::session::turn: Turn error: stream disconnected before completion\n', 'utf8');

  await waitFor(() => notifications.length === 1);
  assert.equal(notifications[0].source, 'codex');
  assert.equal(notifications[0].notifyKind, 'error');
  assert.match(notifications[0].taskInfo, /Codex 失败: stream disconnected before completion/);
});
