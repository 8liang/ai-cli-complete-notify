const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'ai-reminder.js');

function createHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-notify-gemini-hooks-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, '.gemini'), { recursive: true });
  return home;
}

function settingsPath(home) {
  return path.join(home, '.gemini', 'settings.json');
}

function writeSettings(home, settings) {
  fs.writeFileSync(settingsPath(home), `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

function readSettings(home) {
  return JSON.parse(fs.readFileSync(settingsPath(home), 'utf8'));
}

function runHooks(home, ...args) {
  const result = spawnSync(process.execPath, [cliPath, 'hooks', ...args], {
    cwd: projectRoot,
    env: { ...process.env, HOME: home },
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function isOurCommand(hook) {
  return Boolean(
    hook
    && typeof hook.command === 'string'
    && hook.command.includes('ai-reminder')
    && hook.command.includes('--source gemini')
    && hook.command.includes('--from-hook')
  );
}

function getNestedProjectHooks(settings) {
  return settings.hooks.AfterAgent.flatMap((definition) =>
    Array.isArray(definition && definition.hooks)
      ? definition.hooks.filter(isOurCommand)
      : []
  );
}

test('Gemini hook install migrates legacy entries and preserves unrelated hooks', (t) => {
  const home = createHome(t);
  const legacyCommand = `node '${cliPath}' notify --source gemini --from-hook --force`;
  const thirdPartyFlat = { type: 'command', command: '/tmp/legacy-third-party' };
  const thirdPartyNested = { type: 'command', command: '/tmp/nested-third-party' };

  writeSettings(home, {
    theme: 'dark',
    hooks: {
      BeforeAgent: [{ hooks: [{ type: 'command', command: '/tmp/before-agent' }] }],
      AfterAgent: [
        { type: 'command', command: legacyCommand },
        thirdPartyFlat,
        {
          matcher: '',
          sequential: true,
          hooks: [
            thirdPartyNested,
            { type: 'command', command: legacyCommand }
          ]
        }
      ]
    }
  });

  runHooks(home, 'install', '--target', 'gemini');
  const migrated = readSettings(home);

  assert.equal(migrated.theme, 'dark');
  assert.deepEqual(migrated.hooks.BeforeAgent, [
    { hooks: [{ type: 'command', command: '/tmp/before-agent' }] }
  ]);
  assert.deepEqual(migrated.hooks.AfterAgent.slice(0, 2), [
    thirdPartyFlat,
    { matcher: '', sequential: true, hooks: [thirdPartyNested] }
  ]);
  assert.equal(migrated.hooks.AfterAgent.some(isOurCommand), false);
  assert.equal(getNestedProjectHooks(migrated).length, 1);

  const firstInstall = JSON.stringify(migrated);
  runHooks(home, 'install', '--target', 'gemini');
  assert.equal(JSON.stringify(readSettings(home)), firstInstall);
});

test('Gemini hook status rejects legacy flat config and accepts nested config', (t) => {
  const home = createHome(t);
  const legacyCommand = `node '${cliPath}' notify --source gemini --from-hook --force`;

  writeSettings(home, {
    hooks: { AfterAgent: [{ type: 'command', command: legacyCommand }] }
  });
  let status = JSON.parse(runHooks(home, 'status'));
  assert.equal(status.gemini.installed, false);

  runHooks(home, 'install', '--target', 'gemini');
  status = JSON.parse(runHooks(home, 'status'));
  assert.equal(status.gemini.installed, true);

  const preview = JSON.parse(runHooks(home, 'preview', '--target', 'gemini'));
  assert.ok(Array.isArray(preview.hooks.AfterAgent[0].hooks));
  assert.equal(preview.hooks.AfterAgent[0].type, undefined);
});

test('Gemini hook uninstall removes project hooks in both schemas only', (t) => {
  const home = createHome(t);
  const projectCommand = `node '${cliPath}' notify --source gemini --from-hook --force`;
  const unrelated = { type: 'command', command: '/tmp/keep-me' };

  writeSettings(home, {
    keep: true,
    hooks: {
      AfterAgent: [
        { type: 'command', command: projectCommand },
        {
          matcher: '*',
          hooks: [
            { type: 'command', command: projectCommand },
            unrelated
          ]
        },
        { hooks: [{ type: 'command', command: projectCommand }] }
      ]
    }
  });

  runHooks(home, 'uninstall', '--target', 'gemini');
  const settings = readSettings(home);
  assert.equal(settings.keep, true);
  assert.deepEqual(settings.hooks.AfterAgent, [
    { matcher: '*', hooks: [unrelated] }
  ]);
});
