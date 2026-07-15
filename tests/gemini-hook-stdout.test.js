const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');
const cliPath = path.join(projectRoot, 'ai-reminder.js');

function createIsolatedDataDir(channelOverrides = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-notify-gemini-hook-'));
  fs.writeFileSync(path.join(dataDir, '.env'), '', 'utf8');
  fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({
    version: 2,
    channels: {
      webhook: { enabled: false },
      telegram: { enabled: false },
      sound: { enabled: false },
      desktop: { enabled: false },
      email: { enabled: false },
      gotify: { enabled: false },
      ...channelOverrides,
    },
  }), 'utf8');
  return dataDir;
}

function invokeCli(dataDir, args, input, extraEnv = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    env: {
      ...process.env,
      AI_CLI_COMPLETE_NOTIFY_DATA_DIR: dataDir,
      AI_CLI_COMPLETE_NOTIFY_ENV_PATH: path.join(dataDir, '.env'),
      ...extraEnv,
    },
    input: input ? JSON.stringify(input) : undefined,
    encoding: 'utf8',
  });
}

test('Gemini Hook stdout contains only valid JSON', (t) => {
  const dataDir = createIsolatedDataDir();
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

  const result = invokeCli(dataDir, [
    'notify',
    '--source', 'gemini',
    '--from-hook',
    '--force',
  ], {
    hook_event_name: 'AfterAgent',
    cwd: projectRoot,
    session_id: 'gemini-hook-stdout-test',
    prompt: 'test Gemini Hook stdout',
    prompt_response: 'Gemini Hook completed',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '{}');
  assert.deepEqual(JSON.parse(result.stdout), {});
  assert.match(result.stderr, /已跳过提醒: No notification channels enabled/);
});

test('Gemini Hook keeps notifier logs out of stdout', {
  skip: process.platform !== 'darwin',
}, (t) => {
  const dataDir = createIsolatedDataDir({ desktop: { enabled: true } });
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

  const result = invokeCli(dataDir, [
    'notify',
    '--source', 'gemini',
    '--from-hook',
    '--force',
  ], {
    hook_event_name: 'AfterAgent',
    cwd: projectRoot,
    session_id: 'gemini-hook-notifier-log-test',
    prompt_response: 'Gemini Hook notifier log test',
  }, {
    AI_CLI_COMPLETE_NOTIFY_DESKTOP_STDOUT: '1',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '{}');
  assert.deepEqual(JSON.parse(result.stdout), {});
  assert.match(result.stderr, /__AI_CLI_COMPLETE_NOTIFY_DESKTOP__/);
  assert.match(result.stderr, /OK desktop/);
});

test('direct Gemini notifications keep their existing text output', (t) => {
  const dataDir = createIsolatedDataDir();
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

  const result = invokeCli(dataDir, [
    'notify',
    '--source', 'gemini',
    '--force',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /已跳过提醒: No notification channels enabled/);
  assert.equal(result.stderr, '');
});

test('other Hook sources keep their existing text output', (t) => {
  const dataDir = createIsolatedDataDir();
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

  const result = invokeCli(dataDir, [
    'notify',
    '--source', 'claude',
    '--from-hook',
    '--force',
  ], {
    hook_event_name: 'Unknown',
    cwd: projectRoot,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /已跳过提醒: No notification channels enabled/);
  assert.equal(result.stderr, '');
});
