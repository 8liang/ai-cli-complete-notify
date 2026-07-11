const assert = require('node:assert/strict');
const test = require('node:test');

const { shouldSkipByNotificationMode } = require('../src/engine');

test('hybrid mode keeps Codex watch and OpenCode plugin notifications', () => {
  assert.equal(
    shouldSkipByNotificationMode({ sourceName: 'codex', fromHook: false, notificationMode: 'hooks' }),
    null,
  );
  assert.equal(
    shouldSkipByNotificationMode({ sourceName: 'codex', fromHook: true, notificationMode: 'hooks' }),
    null,
  );
  assert.equal(
    shouldSkipByNotificationMode({ sourceName: 'opencode', fromHook: true, notificationMode: 'hooks' }),
    null,
  );
  assert.equal(
    shouldSkipByNotificationMode({ sourceName: 'opencode', fromHook: false, notificationMode: 'watch' }),
    null,
  );
});

test('watch mode no longer blocks Claude/Gemini hooks (hybrid coexistence)', () => {
  assert.equal(
    shouldSkipByNotificationMode({ sourceName: 'claude', fromHook: true, notificationMode: 'watch' }),
    null,
  );
  assert.equal(
    shouldSkipByNotificationMode({ sourceName: 'gemini', fromHook: true, notificationMode: 'watch' }),
    null,
  );
  assert.equal(
    shouldSkipByNotificationMode({ sourceName: 'claude', fromHook: false, notificationMode: 'watch' }),
    null,
  );
});

test('hooks mode prefers installed Claude/Gemini hooks over watch', () => {
  const hooksPath = require.resolve('../src/hooks');
  const original = require.cache[hooksPath];
  require.cache[hooksPath] = {
    id: hooksPath,
    filename: hooksPath,
    loaded: true,
    exports: {
      getHookStatus: () => ({
        claude: { installed: true, settingsPath: '/tmp/claude' },
        gemini: { installed: false, settingsPath: '/tmp/gemini' },
        opencode: { installed: true, settingsPath: '/tmp/opencode' },
      }),
    },
  };

  try {
    // Claude hooks installed: suppress watch-originated notify in hooks mode
    const skipped = shouldSkipByNotificationMode({
      sourceName: 'claude',
      fromHook: false,
      notificationMode: 'hooks',
    });
    assert.ok(skipped && skipped.skipped);
    assert.match(String(skipped.reason), /hooks installed/i);

    // Claude hook-originated still allowed
    assert.equal(
      shouldSkipByNotificationMode({
        sourceName: 'claude',
        fromHook: true,
        notificationMode: 'hooks',
      }),
      null,
    );

    // Gemini hooks not installed: keep watch as fallback
    assert.equal(
      shouldSkipByNotificationMode({
        sourceName: 'gemini',
        fromHook: false,
        notificationMode: 'hooks',
      }),
      null,
    );
  } finally {
    if (original) require.cache[hooksPath] = original;
    else delete require.cache[hooksPath];
  }
});

test('sendNotifications allows Claude hooks even when notificationMode is watch', async () => {
  const enginePath = require.resolve('../src/engine');
  const configPath = require.resolve('../src/config');
  const webhookPath = require.resolve('../src/notifiers/webhook');
  const statePath = require.resolve('../src/state');
  const originalEngine = require.cache[enginePath];
  const originalConfig = require.cache[configPath];
  const originalWebhook = require.cache[webhookPath];
  const originalState = require.cache[statePath];
  const calls = [];

  delete require.cache[enginePath];
  require.cache[configPath] = {
    id: configPath,
    filename: configPath,
    loaded: true,
    exports: {
      loadConfig: () => ({
        format: { includeSourcePrefixInTitle: true },
        summary: { enabled: false },
        ui: { language: 'zh-CN', notificationMode: 'watch' },
        channels: {
          webhook: { enabled: true, urls: ['https://example.test/webhook'] },
          telegram: { enabled: false },
          desktop: { enabled: false },
          sound: { enabled: false },
          email: { enabled: false },
          gotify: { enabled: false },
        },
        sources: {
          claude: {
            enabled: true,
            minDurationMinutes: 0,
            channels: { webhook: true },
          },
          codex: {
            enabled: true,
            minDurationMinutes: 0,
            channels: { webhook: true },
          },
        },
      }),
    },
  };
  require.cache[webhookPath] = {
    id: webhookPath,
    filename: webhookPath,
    loaded: true,
    exports: {
      notifyWebhook: async (args) => {
        calls.push(args);
        return { ok: true, results: [{ ok: true }] };
      },
    },
  };
  require.cache[statePath] = {
    id: statePath,
    filename: statePath,
    loaded: true,
    exports: {
      checkAndRememberNotification: () => false,
    },
  };

  try {
    const { sendNotifications } = require('../src/engine');

    const hookResult = await sendNotifications({
      source: 'claude',
      taskInfo: 'Claude hook complete',
      durationMs: 1000,
      cwd: '/repo',
      force: true,
      fromHook: true,
      skipSummary: true,
      outputContent: 'done via hook',
    });
    assert.equal(hookResult.skipped, false);
    assert.equal(calls.length, 1);

    const codexResult = await sendNotifications({
      source: 'codex',
      taskInfo: 'Codex watch complete',
      durationMs: 1000,
      cwd: '/repo',
      force: true,
      fromHook: false,
      skipSummary: true,
      outputContent: 'done via watch',
    });
    assert.equal(codexResult.skipped, false);
    assert.equal(calls.length, 2);
  } finally {
    if (originalEngine) require.cache[enginePath] = originalEngine;
    else delete require.cache[enginePath];
    if (originalConfig) require.cache[configPath] = originalConfig;
    else delete require.cache[configPath];
    if (originalWebhook) require.cache[webhookPath] = originalWebhook;
    else delete require.cache[webhookPath];
    if (originalState) require.cache[statePath] = originalState;
    else delete require.cache[statePath];
  }
});
