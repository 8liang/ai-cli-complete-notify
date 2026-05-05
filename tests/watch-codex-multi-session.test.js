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

function appendJsonl(filePath, entries) {
  const content = entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
  fs.appendFileSync(filePath, content, 'utf8');
}

test('codex watch notifies only after the parent session completes when subagents finish first', async (t) => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-reminder-codex-home-'));
  const previousEnv = {
    CODEX_WATCH_BACKEND: process.env.CODEX_WATCH_BACKEND,
    CODEX_FOLLOW_TOP_N: process.env.CODEX_FOLLOW_TOP_N,
    CODEX_SEED_CATCHUP_MS: process.env.CODEX_SEED_CATCHUP_MS,
    CODEX_STRICT_FINAL_ANSWER: process.env.CODEX_STRICT_FINAL_ANSWER,
    CODEX_TUI_LOG_PATH: process.env.CODEX_TUI_LOG_PATH,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
  };

  const notifications = [];
  const enginePath = require.resolve('../src/engine');
  const watchPath = require.resolve('../src/watch');
  const originalEngineCache = require.cache[enginePath];
  const originalWatchCache = require.cache[watchPath];

  function restore() {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (originalEngineCache) require.cache[enginePath] = originalEngineCache;
    else delete require.cache[enginePath];
    if (originalWatchCache) require.cache[watchPath] = originalWatchCache;
    else delete require.cache[watchPath];
    fs.rmSync(tempHome, { recursive: true, force: true });
  }

  t.after(restore);

  process.env.CODEX_WATCH_BACKEND = 'sessions';
  process.env.CODEX_FOLLOW_TOP_N = '5';
  process.env.CODEX_SEED_CATCHUP_MS = '0';
  process.env.CODEX_STRICT_FINAL_ANSWER = '1';
  process.env.CODEX_TUI_LOG_PATH = path.join(tempHome, 'missing-codex-tui.log');
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

  const sessionDir = path.join(tempHome, '.codex', 'sessions', '2026', '04', '28');
  fs.mkdirSync(sessionDir, { recursive: true });
  const parentFile = path.join(sessionDir, 'parent.jsonl');
  const childOneFile = path.join(sessionDir, 'child-one.jsonl');
  const childTwoFile = path.join(sessionDir, 'child-two.jsonl');
  for (const filePath of [parentFile, childOneFile, childTwoFile]) {
    fs.writeFileSync(filePath, '', 'utf8');
  }

  const logs = [];
  const stop = startWatch({
    sources: ['codex'],
    intervalMs: 50,
    log: (line) => logs.push(line),
    confirmAlert: { enabled: false },
  });
  t.after(() => stop());

  await sleep(650);

  appendJsonl(parentFile, [
    { timestamp: 1, type: 'event_msg', payload: { type: 'task_started', turn_id: 'parent-turn' } },
  ]);
  await sleep(650);

  appendJsonl(childOneFile, [
    { timestamp: 2, type: 'event_msg', payload: { type: 'task_started', turn_id: 'child-turn-1' } },
    { timestamp: 3, type: 'event_msg', payload: { type: 'agent_message', content: 'child one done' } },
    { timestamp: 4, type: 'event_msg', payload: { type: 'task_complete', turn_id: 'child-turn-1', last_agent_message: 'child one done' } },
  ]);
  await sleep(650);
  assert.equal(notifications.length, 0, `unexpected child completion notification: ${logs.join('\n')}`);

  appendJsonl(childTwoFile, [
    { timestamp: 5, type: 'event_msg', payload: { type: 'task_started', turn_id: 'child-turn-2' } },
    { timestamp: 6, type: 'event_msg', payload: { type: 'agent_message', content: 'child two done' } },
    { timestamp: 7, type: 'event_msg', payload: { type: 'task_complete', turn_id: 'child-turn-2', last_agent_message: 'child two done' } },
  ]);
  await sleep(650);
  assert.equal(notifications.length, 0, `unexpected child completion notification: ${logs.join('\n')}`);

  appendJsonl(parentFile, [
    { timestamp: 8, type: 'event_msg', payload: { type: 'agent_message', content: 'parent done' } },
    { timestamp: 9, type: 'event_msg', payload: { type: 'task_complete', turn_id: 'parent-turn', last_agent_message: 'parent done' } },
  ]);

  await waitFor(() => notifications.length === 1);
  assert.equal(notifications[0].source, 'codex');
  assert.equal(notifications[0].outputContent, 'parent done');
});

test('codex watch does not block an unrelated session completion when another cwd is still active', async (t) => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-reminder-codex-home-'));
  const previousEnv = {
    CODEX_WATCH_BACKEND: process.env.CODEX_WATCH_BACKEND,
    CODEX_FOLLOW_TOP_N: process.env.CODEX_FOLLOW_TOP_N,
    CODEX_SEED_CATCHUP_MS: process.env.CODEX_SEED_CATCHUP_MS,
    CODEX_STRICT_FINAL_ANSWER: process.env.CODEX_STRICT_FINAL_ANSWER,
    CODEX_TUI_LOG_PATH: process.env.CODEX_TUI_LOG_PATH,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
  };

  const notifications = [];
  const enginePath = require.resolve('../src/engine');
  const watchPath = require.resolve('../src/watch');
  const originalEngineCache = require.cache[enginePath];
  const originalWatchCache = require.cache[watchPath];

  function restore() {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (originalEngineCache) require.cache[enginePath] = originalEngineCache;
    else delete require.cache[enginePath];
    if (originalWatchCache) require.cache[watchPath] = originalWatchCache;
    else delete require.cache[watchPath];
    fs.rmSync(tempHome, { recursive: true, force: true });
  }

  t.after(restore);

  process.env.CODEX_WATCH_BACKEND = 'sessions';
  process.env.CODEX_FOLLOW_TOP_N = '5';
  process.env.CODEX_SEED_CATCHUP_MS = '0';
  process.env.CODEX_STRICT_FINAL_ANSWER = '1';
  process.env.CODEX_TUI_LOG_PATH = path.join(tempHome, 'missing-codex-tui.log');
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

  const sessionDir = path.join(tempHome, '.codex', 'sessions', '2026', '04', '28');
  fs.mkdirSync(sessionDir, { recursive: true });
  const activeFile = path.join(sessionDir, 'active.jsonl');
  const shortFile = path.join(sessionDir, 'short.jsonl');
  for (const filePath of [activeFile, shortFile]) {
    fs.writeFileSync(filePath, '', 'utf8');
  }

  const logs = [];
  const stop = startWatch({
    sources: ['codex'],
    intervalMs: 50,
    log: (line) => logs.push(line),
    confirmAlert: { enabled: false },
  });
  t.after(() => stop());

  await sleep(650);

  appendJsonl(activeFile, [
    { timestamp: 1, type: 'turn_context', payload: { cwd: '/workspace/leader' } },
    { timestamp: 2, type: 'event_msg', payload: { type: 'task_started', turn_id: 'leader-turn' } },
  ]);
  await sleep(650);

  appendJsonl(shortFile, [
    { timestamp: 3, type: 'turn_context', payload: { cwd: '/workspace/unrelated' } },
    { timestamp: 4, type: 'event_msg', payload: { type: 'task_started', turn_id: 'short-turn' } },
    { timestamp: 5, type: 'event_msg', payload: { type: 'agent_message', content: 'hello done' } },
    { timestamp: 6, type: 'event_msg', payload: { type: 'task_complete', turn_id: 'short-turn', last_agent_message: 'hello done' } },
  ]);

  await waitFor(() => notifications.length === 1, { timeoutMs: 1500, intervalMs: 25 });
  assert.equal(notifications[0].source, 'codex');
  assert.equal(notifications[0].outputContent, 'hello done');
  assert.ok(
    logs.some((line) => line.includes('sent: 1/1') && line.includes('task_complete')),
    `expected notification log, got:\n${logs.join('\n')}`
  );
});
