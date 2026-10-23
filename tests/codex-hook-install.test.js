const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'ai-reminder.js');

function createSandbox(t) {
  const target = path.join(projectRoot, 'src-tauri', 'target');
  fs.mkdirSync(target, { recursive: true });
  const sandbox = fs.mkdtempSync(path.join(target, 'codex-hooks-'));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const home = path.join(sandbox, 'home');
  const codexHome = path.join(sandbox, 'custom-codex');
  const envPath = path.join(sandbox, '.env');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(envPath, '');
  return {
    sandbox,
    home,
    codexHome,
    settingsPath: path.join(codexHome, 'hooks.json'),
    env: {
      PATH: process.env.PATH,
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: codexHome,
      AI_CLI_COMPLETE_NOTIFY_DATA_DIR: path.join(sandbox, 'data'),
      AI_CLI_COMPLETE_NOTIFY_ENV_PATH: envPath,
    },
  };
}

function runHooks(sb, ...args) {
  return spawnSync(process.execPath, [cliPath, 'hooks', ...args], {
    cwd: sb.sandbox,
    env: sb.env,
    encoding: 'utf8',
  });
}

function seedConfig(sb, config) {
  fs.mkdirSync(sb.codexHome, { recursive: true });
  fs.writeFileSync(sb.settingsPath, JSON.stringify(config));
}

function readConfig(sb) {
  return JSON.parse(fs.readFileSync(sb.settingsPath, 'utf8'));
}

function ourHandlers(config, event) {
  return (config.hooks?.[event] || []).flatMap((block) => block.hooks || [])
    .filter((hook) => hook.command?.includes('--source codex') && hook.command.includes('--from-hook'));
}

test('Codex install registers prompt timing and async Stop hooks under CODEX_HOME', (t) => {
  const sb = createSandbox(t);
  const result = runHooks(sb, 'install', '--target', 'codex');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const config = readConfig(sb);
  for (const event of ['UserPromptSubmit', 'Stop']) {
    const hooks = ourHandlers(config, event);
    assert.equal(hooks.length, 1);
    assert.equal(hooks[0].type, 'command');
    assert.match(hooks[0].command, /ai-reminder\.js.*notify --source codex --from-hook/);
    assert.doesNotMatch(hooks[0].command, /--force/);
  }
  assert.equal(ourHandlers(config, 'Stop')[0].async, true);
  assert.equal(fs.existsSync(path.join(sb.home, '.codex')), false);
  assert.equal(fs.existsSync(path.join(sb.codexHome, 'config.toml')), false);
});

test('Codex install is idempotent and uninstall preserves other handlers and settings', (t) => {
  const sb = createSandbox(t);
  const otherSource = { type: 'command', command: 'node ai-reminder.js notify --source claude --from-hook' };
  const thirdParty = { type: 'command', command: 'echo third-party' };
  const original = {
    keep: { nested: true },
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [thirdParty] }],
      UserPromptSubmit: [{ matcher: 'keep', hooks: [thirdParty] }],
      Stop: [{ matcher: 'keep', hooks: [otherSource, thirdParty] }],
    },
  };
  seedConfig(sb, original);
  assert.equal(runHooks(sb, 'install', '--target', 'codex').status, 0);
  const first = fs.readFileSync(sb.settingsPath, 'utf8');
  assert.equal(runHooks(sb, 'install', '--target', 'codex').status, 0);
  assert.equal(fs.readFileSync(sb.settingsPath, 'utf8'), first);
  assert.equal(ourHandlers(readConfig(sb), 'Stop').length, 1);
  assert.equal(ourHandlers(readConfig(sb), 'UserPromptSubmit').length, 1);
  assert.equal(runHooks(sb, 'uninstall', '--target', 'codex').status, 0);
  assert.deepEqual(readConfig(sb), original);
});

test('Codex preview does not write and status requires both hook events', (t) => {
  const sb = createSandbox(t);
  const preview = runHooks(sb, 'preview', '--target', 'codex');
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(ourHandlers(JSON.parse(preview.stdout), 'Stop').length, 1);
  assert.equal(ourHandlers(JSON.parse(preview.stdout), 'UserPromptSubmit').length, 1);
  assert.equal(fs.existsSync(sb.settingsPath), false);
  const before = JSON.parse(runHooks(sb, 'status').stdout).codex;
  assert.equal(before.installed, false);
  assert.equal(before.settingsPath, sb.settingsPath);
  assert.equal(runHooks(sb, 'install', '--target', 'codex').status, 0);
  assert.equal(JSON.parse(runHooks(sb, 'status').stdout).codex.installed, true);
  const config = readConfig(sb);
  delete config.hooks.UserPromptSubmit;
  seedConfig(sb, config);
  assert.equal(JSON.parse(runHooks(sb, 'status').stdout).codex.installed, false);
});

test('Codex install and uninstall refuse malformed hook configs without overwriting them', (t) => {
  const sb = createSandbox(t);
  fs.mkdirSync(sb.codexHome, { recursive: true });
  for (const raw of ['{ invalid json', '[]', '{"hooks":[]}', '{"hooks":{"Stop":{}}}', '{"hooks":{"UserPromptSubmit":false}}']) {
    fs.writeFileSync(sb.settingsPath, raw);
    for (const command of ['install', 'uninstall']) {
      const result = runHooks(sb, command, '--target', 'codex');
      assert.equal(result.status, 1, `${command} must reject ${raw}`);
      assert.equal(fs.readFileSync(sb.settingsPath, 'utf8'), raw);
    }
  }
});
