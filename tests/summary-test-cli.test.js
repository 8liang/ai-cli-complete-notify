const assert = require('node:assert/strict');
const test = require('node:test');

function withConsoleCapture(fn) {
  const originalLog = console.log;
  const originalError = console.error;
  const logs = [];
  const errors = [];
  console.log = (...args) => logs.push(args.join(' '));
  console.error = (...args) => errors.push(args.join(' '));
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.log = originalLog;
      console.error = originalError;
    })
    .then((result) => ({ result, logs, errors }));
}

function loadCliWithSummaryMock(summaryResult, sendNotifications) {
  const cliPath = require.resolve('../src/cli');
  const configPath = require.resolve('../src/config');
  const summaryPath = require.resolve('../src/summary');
  const enginePath = require.resolve('../src/engine');
  const originalCli = require.cache[cliPath];
  const originalConfig = require.cache[configPath];
  const originalSummary = require.cache[summaryPath];
  const originalEngine = require.cache[enginePath];

  delete require.cache[cliPath];
  require.cache[configPath] = {
    id: configPath,
    filename: configPath,
    loaded: true,
    exports: {
      loadConfig: () => ({
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
      }),
      saveConfig: (config) => config,
      getConfigPath: () => '/tmp/settings.json',
    },
  };
  require.cache[summaryPath] = {
    id: summaryPath,
    filename: summaryPath,
    loaded: true,
    exports: {
      summarizeTaskDetailed: async () => summaryResult,
    },
  };
  if (sendNotifications) {
    require.cache[enginePath] = {
      id: enginePath,
      filename: enginePath,
      loaded: true,
      exports: {
        sendNotifications,
      },
    };
  }

  const cli = require('../src/cli');

  function restore() {
    if (originalCli) require.cache[cliPath] = originalCli;
    else delete require.cache[cliPath];
    if (originalConfig) require.cache[configPath] = originalConfig;
    else delete require.cache[configPath];
    if (originalSummary) require.cache[summaryPath] = originalSummary;
    else delete require.cache[summaryPath];
    if (originalEngine) require.cache[enginePath] = originalEngine;
    else delete require.cache[enginePath];
  }

  return { cli, restore };
}

test('summary-test prints the returned AI summary as JSON', async (t) => {
  const { cli, restore } = loadCliWithSummaryMock({
    ok: true,
    summary: 'AI 摘要测试成功',
    status: 200,
  });
  t.after(restore);

  const { result, logs, errors } = await withConsoleCapture(() => cli.runCli(['summary-test']));

  assert.equal(result.ok, true);
  assert.equal(errors.length, 0);
  const payload = JSON.parse(logs.join('\n'));
  assert.equal(payload.ok, true);
  assert.equal(payload.summary, 'AI 摘要测试成功');
});

test('summary-test prints explicit failure details as JSON', async (t) => {
  const { cli, restore } = loadCliWithSummaryMock({
    ok: false,
    error: 'timeout',
    detail: 'timeout',
  });
  t.after(restore);

  const { result, logs } = await withConsoleCapture(() => cli.runCli(['summary-test']));

  assert.equal(result.ok, true);
  const payload = JSON.parse(logs.join('\n'));
  assert.equal(payload.ok, false);
  assert.equal(payload.error, 'timeout');
  assert.equal(payload.detail, 'timeout');
});

test('summary-test can send a real notification with the returned summary', async (t) => {
  const notifications = [];
	  const { cli, restore } = loadCliWithSummaryMock(
	    {
	      ok: true,
	      summary: 'AI 摘要测试成功',
	      status: 200,
	    },
	    async (args) => {
	      notifications.push(args);
	      return {
	        results: [{
	          channel: 'webhook',
	          ok: true,
	          results: [{ url: 'https://example.test/webhook-token', ok: true }],
	        }],
	        skipped: false,
	      };
	    },
	  );
	  t.after(restore);

  const { result, logs } = await withConsoleCapture(() => cli.runCli(['summary-test', '--notify', '--source', 'codex']));

  assert.equal(result.ok, true);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].source, 'codex');
  assert.equal(notifications[0].force, true);
  assert.equal(notifications[0].skipSummary, true);
  assert.match(notifications[0].taskInfo, /AI 摘要测试成功/);
  assert.match(notifications[0].outputContent, /AI 摘要测试成功/);

	  const payload = JSON.parse(logs.join('\n'));
	  assert.equal(payload.ok, true);
	  assert.doesNotMatch(logs.join('\n'), /webhook-token/);
	  assert.equal(payload.notification.results[0].channel, 'webhook');
	  assert.equal(payload.notification.results[0].ok, true);
});

test('summary-test notification logs do not pollute JSON stdout', async (t) => {
  const { cli, restore } = loadCliWithSummaryMock(
    {
      ok: true,
      summary: 'AI 摘要测试成功',
      status: 200,
    },
    async () => {
      console.log('[webhook] 使用主题: light');
      console.log('[webhook] 未检测到输出内容');
      return {
        results: [{ channel: 'webhook', ok: true }],
        skipped: false,
      };
    },
  );
  t.after(restore);

  const { logs, errors } = await withConsoleCapture(() => cli.runCli(['summary-test', '--notify']));

  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs[0], /\\[webhook\\]/);
  assert.match(errors.join('\n'), /\[webhook\]/);
  const payload = JSON.parse(logs[0]);
  assert.equal(payload.ok, true);
  assert.equal(payload.notification.results[0].ok, true);
});
