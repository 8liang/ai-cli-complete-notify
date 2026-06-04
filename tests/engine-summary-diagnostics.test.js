const assert = require('node:assert/strict');
const test = require('node:test');

function loadEngineWithSummaryMock(summaryResult) {
  const enginePath = require.resolve('../src/engine');
  const configPath = require.resolve('../src/config');
  const summaryPath = require.resolve('../src/summary');
  const webhookPath = require.resolve('../src/notifiers/webhook');
  const statePath = require.resolve('../src/state');
  const originalEngine = require.cache[enginePath];
  const originalConfig = require.cache[configPath];
  const originalSummary = require.cache[summaryPath];
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
        summary: {
          enabled: true,
          provider: 'deepseek',
          apiUrl: 'https://api.deepseek.com',
          apiKey: 'test-key',
          model: 'deepseek-chat',
          timeoutMs: 15000,
          maxTokens: 200,
          prompt: '',
        },
        ui: { language: 'zh-CN' },
        channels: {
          webhook: { enabled: true, urls: ['https://example.test/webhook'] },
          telegram: { enabled: false },
          desktop: { enabled: false },
          sound: { enabled: false },
          email: { enabled: false },
        },
        sources: {
          codex: {
            enabled: true,
            minDurationMinutes: 0,
            channels: { webhook: true },
          },
        },
      }),
    },
  };
  require.cache[summaryPath] = {
    id: summaryPath,
    filename: summaryPath,
    loaded: true,
    exports: {
      summarizeTask: async () => summaryResult.summary || '',
      summarizeTaskDetailed: async () => summaryResult,
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

  const engine = require('../src/engine');

  function restore() {
    if (originalEngine) require.cache[enginePath] = originalEngine;
    else delete require.cache[enginePath];
    if (originalConfig) require.cache[configPath] = originalConfig;
    else delete require.cache[configPath];
    if (originalSummary) require.cache[summaryPath] = originalSummary;
    else delete require.cache[summaryPath];
    if (originalWebhook) require.cache[webhookPath] = originalWebhook;
    else delete require.cache[webhookPath];
    if (originalState) require.cache[statePath] = originalState;
    else delete require.cache[statePath];
  }

  return { engine, calls, restore };
}

test('sendNotifications reports summary failure diagnostics', async (t) => {
  const { engine, calls, restore } = loadEngineWithSummaryMock({
    ok: false,
    error: 'timeout',
    status: 504,
  });
  t.after(restore);

  const result = await engine.sendNotifications({
    source: 'codex',
    taskInfo: 'Codex 完成',
    durationMs: 1000,
    cwd: process.cwd(),
    force: true,
    outputContent: 'original output',
    summaryContext: { assistantMessage: 'original output' },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].summaryUsed, false);
  assert.deepEqual(calls[0].summaryDiagnostics, {
    attempted: true,
    used: false,
    error: 'timeout',
    status: 504,
  });
  assert.deepEqual(result.summary, {
    attempted: true,
    used: false,
    error: 'timeout',
    status: 504,
  });
});

test('watch result summary includes summary diagnostics', () => {
  const { _summarizeResult } = require('../src/watch');

  assert.equal(
    _summarizeResult({
      skipped: false,
      results: [{ ok: true }],
      summary: { attempted: true, used: false, error: 'timeout', status: 504 },
    }),
    'sent: 1/1 summary: timeout HTTP 504',
  );
});
