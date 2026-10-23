const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { acquireCodexNotificationClaim } = require('../src/codex-notification-claim');

const projectRoot = path.resolve(__dirname, '..');

function createHarness(t, notify = () => Promise.resolve({ ok: true })) {
  const target = path.join(projectRoot, 'src-tauri', 'target');
  fs.mkdirSync(target, { recursive: true });
  const sandbox = fs.mkdtempSync(path.join(target, 'codex-engine-claim-'));
  const previousDataDir = process.env.AI_CLI_COMPLETE_NOTIFY_DATA_DIR;
  process.env.AI_CLI_COMPLETE_NOTIFY_DATA_DIR = sandbox;
  const calls = [];
  const legacyCalls = [];
  const claimCalls = [];
  const originals = new Map();
  const config = {
    format: { includeSourcePrefixInTitle: true },
    summary: { enabled: false },
    ui: { notificationMode: 'hooks', language: 'zh-CN' },
    channels: Object.fromEntries(['webhook', 'telegram', 'desktop', 'sound', 'email', 'gotify']
      .map((channel) => [channel, { enabled: channel === 'webhook' }])),
    sources: Object.fromEntries(['codex', 'claude', 'gemini']
      .map((source) => [source, { enabled: true, minDurationMinutes: 0, channels: { webhook: true } }])),
  };
  const unexpected = () => { throw new Error('Unexpected notifier or external helper call'); };

  function stub(moduleName, exports) {
    const filename = require.resolve(moduleName);
    originals.set(filename, require.cache[filename]);
    require.cache[filename] = { id: filename, filename, loaded: true, exports };
  }

  const enginePath = require.resolve('../src/engine');
  originals.set(enginePath, require.cache[enginePath]);
  delete require.cache[enginePath];
  stub('../src/config', { loadConfig: () => config });
  stub('../src/state', {
    checkAndRememberNotification: (args) => {
      legacyCalls.push(args);
      return false;
    },
  });
  stub('../src/codex-notification-claim', {
    acquireCodexNotificationClaim: (...args) => {
      claimCalls.push(args);
      return acquireCodexNotificationClaim(...args);
    },
  });
  stub('../src/notifiers/webhook', {
    notifyWebhook: (args) => {
      calls.push(args);
      return notify(args, calls.length);
    },
  });
  stub('../src/notifiers/telegram', { notifyTelegram: unexpected });
  stub('../src/notifiers/sound', { notifySound: unexpected });
  stub('../src/notifiers/desktop', {
    notifyDesktopBalloon: unexpected,
    prewarmWpf: () => {},
    supportsDesktopNotifications: () => true,
  });
  stub('../src/notifiers/email', { notifyEmail: unexpected });
  stub('../src/notifiers/gotify', { notifyGotify: unexpected });
  stub('../src/project-name', { getProjectName: () => 'sandbox-project' });
  stub('../src/summary', { summarizeTaskDetailed: unexpected });
  stub('../src/focus', { focusTarget: unexpected });

  t.after(() => {
    for (const [filename, original] of originals) {
      if (original) require.cache[filename] = original;
      else delete require.cache[filename];
    }
    if (previousDataDir === undefined) delete process.env.AI_CLI_COMPLETE_NOTIFY_DATA_DIR;
    else process.env.AI_CLI_COMPLETE_NOTIFY_DATA_DIR = previousDataDir;
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  const { sendNotifications } = require('../src/engine');
  return {
    calls,
    legacyCalls,
    claimCalls,
    sandbox,
    send: (options = {}) => sendNotifications({
      source: 'codex',
      taskInfo: 'Isolated completion test',
      durationMs: 1000,
      cwd: sandbox,
      outputContent: 'Completed test task.',
      skipSummary: true,
      ...options,
    }),
  };
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('engine uses claims only for explicit Codex completion keys and preserves legacy dedupe routing', async (t) => {
  const harness = createHarness(t);
  await harness.send({ dedupeKey: 'codex-complete:claim-only' });
  assert.equal(harness.claimCalls.length, 1);
  assert.equal(harness.legacyCalls.length, 0);
  assert.equal(harness.claimCalls[0][0], 'codex-complete:claim-only');

  const legacyInputs = [
    { source: 'claude', dedupeKey: 'codex-complete:claude' },
    { source: 'gemini', dedupeKey: 'codex-complete:gemini' },
    { source: 'codex', dedupeKey: 'gemini-complete:codex' },
    { source: 'codex', dedupeKey: 'ordinary-key' },
    { source: 'codex', outputContent: 'codex-complete:output-without-explicit-key' },
  ];
  for (const input of legacyInputs) await harness.send(input);

  assert.equal(harness.claimCalls.length, 1);
  assert.equal(harness.legacyCalls.length, legacyInputs.length);
  for (let index = 0; index < legacyInputs.length; index += 1) {
    const input = legacyInputs[index];
    const call = harness.legacyCalls[index];
    assert.equal(call.source, input.source);
    assert.equal(call.text, input.dedupeKey || input.outputContent);
    assert.equal(call.cwd, input.dedupeKey ? '' : harness.sandbox);
  }
  assert.equal(harness.calls.length, 1 + legacyInputs.length);
});

test('engine sends only once when Codex hook and watch concurrently report a successful turn', { timeout: 10000 }, async (t) => {
  const harness = createHarness(t, async () => {
    await pause(80);
    return { ok: true };
  });
  const key = 'codex-complete:concurrent-success';
  const results = await Promise.all([
    harness.send({ dedupeKey: key, fromHook: true }),
    harness.send({ dedupeKey: key, fromHook: false, cwd: path.join(harness.sandbox, 'watch-cwd') }),
  ]);

  assert.equal(harness.claimCalls.length, 2);
  assert.equal(harness.legacyCalls.length, 0);
  assert.equal(harness.calls.length, 1);
  assert.equal(results.filter((result) => result.skipped === false).length, 1);
  const duplicate = results.find((result) => result.skipped === true);
  assert.match(duplicate.reason, /duplicate notification suppressed for codex/);
  assert.equal(results.find((result) => !result.skipped).results[0].ok, true);
});

test('engine lets the waiting Codex candidate send when every channel in the first attempt fails', { timeout: 10000 }, async (t) => {
  const harness = createHarness(t, async (_args, attempt) => {
    if (attempt === 1) {
      await pause(80);
      return { ok: false, error: 'simulated delivery failure' };
    }
    return { ok: true };
  });
  const key = 'codex-complete:concurrent-failure';
  const results = await Promise.all([
    harness.send({ dedupeKey: key, fromHook: true }),
    harness.send({ dedupeKey: key, fromHook: false }),
  ]);

  assert.equal(harness.calls.length, 2);
  assert.equal(harness.legacyCalls.length, 0);
  assert.deepEqual(results.map((result) => result.skipped), [false, false]);
  assert.deepEqual(results.map((result) => result.results[0].ok), [false, true]);
  const duplicate = await harness.send({ dedupeKey: key });
  assert.equal(duplicate.skipped, true);
  assert.match(duplicate.reason, /duplicate/);
  assert.equal(harness.calls.length, 2);
});

test('engine releases a Codex claim after a synchronous notifier throw so the waiting candidate can send', { timeout: 10000 }, async (t) => {
  const harness = createHarness(t, (_args, attempt) => {
    if (attempt === 1) throw new Error('simulated synchronous notifier failure');
    return Promise.resolve({ ok: true });
  });
  const key = 'codex-complete:concurrent-throw';
  const results = await Promise.allSettled([
    harness.send({ dedupeKey: key, fromHook: true }),
    harness.send({ dedupeKey: key, fromHook: false }),
  ]);

  assert.equal(results[0].status, 'rejected');
  assert.match(results[0].reason.message, /simulated synchronous notifier failure/);
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(results[1].value.skipped, false);
  assert.equal(results[1].value.results[0].ok, true);
  assert.equal(harness.calls.length, 2);
  assert.equal(harness.legacyCalls.length, 0);
  const duplicate = await harness.send({ dedupeKey: key });
  assert.equal(duplicate.skipped, true);
  assert.equal(harness.calls.length, 2);
});
