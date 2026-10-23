const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DEFAULT_CONFIG } = require('../src/default-config');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'ai-reminder.js');

function createSandbox(t, minDurationMinutes = 0) {
  const target = path.join(projectRoot, 'src-tauri', 'target');
  fs.mkdirSync(target, { recursive: true });
  const sandbox = fs.mkdtempSync(path.join(target, 'codex-cli-'));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const dataDir = path.join(sandbox, 'data');
  const home = path.join(sandbox, 'home');
  const capturePath = path.join(sandbox, 'webhook-calls.jsonl');
  const preloadPath = path.join(sandbox, 'preload.cjs');
  const envPath = path.join(sandbox, '.env');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(envPath, '');
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  config.summary.enabled = false;
  config.ui.notificationMode = 'hooks';
  for (const [name, channel] of Object.entries(config.channels)) channel.enabled = name === 'webhook';
  config.channels.webhook.urls = ['https://example.test/no-network'];
  config.sources.codex.enabled = true;
  config.sources.codex.minDurationMinutes = minDurationMinutes;
  for (const name of Object.keys(config.channels)) config.sources.codex.channels[name] = name === 'webhook';
  fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify(config));
  fs.writeFileSync(preloadPath, `
const fs = require('node:fs');
const failNetwork = () => { throw new Error('Unexpected network request in Codex hook test'); };
require('node:http').request = failNetwork;
require('node:https').request = failNetwork;
global.fetch = failNetwork;
Date.now = () => Number(process.env.CODEX_TEST_NOW);
const webhookPath = require.resolve(${JSON.stringify(path.join(projectRoot, 'src', 'notifiers', 'webhook'))});
require.cache[webhookPath] = {
  id: webhookPath, filename: webhookPath, loaded: true,
  exports: {
    notifyWebhook: async ({ sourceName, outputContent, taskInfo }) => {
      fs.appendFileSync(${JSON.stringify(capturePath)}, JSON.stringify({ sourceName, outputContent, taskInfo, desktopStdout: process.env.AI_CLI_COMPLETE_NOTIFY_DESKTOP_STDOUT }) + '\\n');
      console.log('mock webhook diagnostic');
      return { ok: true, results: [{ ok: true }] };
    }
  }
};
`);
  return {
    sandbox,
    dataDir,
    capturePath,
    preloadPath,
    env: {
      PATH: process.env.PATH,
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: path.join(sandbox, 'codex'),
      AI_CLI_COMPLETE_NOTIFY_DATA_DIR: dataDir,
      AI_CLI_COMPLETE_NOTIFY_ENV_PATH: envPath,
    },
  };
}

function runHook(sb, payload, now = 1000000) {
  const result = spawnSync(process.execPath, [
    '--require', sb.preloadPath, cliPath,
    'notify', '--source', 'codex', '--from-hook', '--force',
  ], {
    cwd: sb.sandbox,
    env: { ...sb.env, CODEX_TEST_NOW: String(now) },
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.equal(result.stdout, '{}\n', 'Codex hook stdout must contain only its JSON response');
  return result;
}

function payload(sb, event = 'Stop', session = 'session-a', turn = 'turn-a') {
  return {
    hook_event_name: event,
    session_id: session,
    turn_id: turn,
    cwd: sb.sandbox,
    last_assistant_message: 'Same final answer.',
  };
}

function captured(sb) {
  if (!fs.existsSync(sb.capturePath)) return [];
  return fs.readFileSync(sb.capturePath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

test('Codex CLI reads stdin and keeps notification diagnostics off its JSON stdout', (t) => {
  const sb = createSandbox(t);
  sb.env.AI_CLI_COMPLETE_NOTIFY_DESKTOP_STDOUT = '1';
  const result = runHook(sb, payload(sb));
  assert.match(result.stderr, /mock webhook diagnostic/);
  assert.equal(captured(sb).length, 1);
  assert.equal(captured(sb)[0].sourceName, 'codex');
  assert.equal(captured(sb)[0].outputContent, 'Same final answer.');
  assert.equal(captured(sb)[0].desktopStdout, '0', 'native hooks must disable the Tauri stdout notification bridge');
});

test('Codex CLI returns JSON and sends nothing for malformed or unrelated hook payloads', (t) => {
  const sb = createSandbox(t);
  for (const input of [
    'not-json', '', 'null', '[]', '{}',
    { ...payload(sb), hook_event_name: 'PreToolUse' },
    { ...payload(sb), session_id: '' },
    { ...payload(sb), turn_id: '' },
  ]) runHook(sb, input);
  assert.equal(captured(sb).length, 0);
});

test('Codex CLI preserves duration thresholds and isolates simultaneous sessions', (t) => {
  const sb = createSandbox(t, 5);
  assert.match(runHook(sb, payload(sb)).stderr, /No duration recorded/);
  runHook(sb, payload(sb, 'UserPromptSubmit', 'long-session'), 1000000);
  runHook(sb, payload(sb, 'UserPromptSubmit', 'short-session'), 1300000);
  assert.equal(captured(sb).length, 0, 'prompt hooks only record timing');
  const long = runHook(sb, payload(sb, 'Stop', 'long-session'), 1360000);
  assert.doesNotMatch(long.stderr, /below threshold|No duration recorded/);
  assert.equal(captured(sb).length, 1);
  const short = runHook(sb, payload(sb, 'Stop', 'short-session'), 1360000);
  assert.match(short.stderr, /below threshold/);
  assert.equal(captured(sb).length, 1, 'legacy --force must not bypass native hook thresholds');
  assert.match(runHook(sb, payload(sb, 'Stop', 'short-session'), 2000000).stderr, /below threshold/);
  assert.equal(captured(sb).length, 1, 'repeated Stop must keep the original completion time');
});

test('Codex CLI dedupes a session turn across processes without suppressing identical outputs elsewhere', (t) => {
  const sb = createSandbox(t);
  const first = payload(sb);
  runHook(sb, first);
  const duplicate = runHook(sb, { ...first, last_assistant_message: 'Changed final wording.' });
  assert.match(duplicate.stderr, /duplicate notification suppressed/);
  assert.equal(captured(sb).length, 1);
  runHook(sb, payload(sb, 'Stop', 'session-b'));
  runHook(sb, payload(sb, 'Stop', 'session-a', 'turn-b'));
  assert.equal(captured(sb).length, 3);
});
