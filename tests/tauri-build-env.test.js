const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.resolve(__dirname, '../tools/run-tauri-build.js');
const source = fs.readFileSync(scriptPath, 'utf8');

function captureBuild(platform, parentEnv) {
  const spawns = [];
  const directories = [];
  const exits = [];
  const exitSignal = {};
  const errors = [];
  const pathModule = platform === 'win32' ? path.win32 : path.posix;
  const executable = platform === 'win32' ? 'C:\\node\\node.exe' : '/runtime/bin/node';
  try {
    vm.runInNewContext(source, {
      __dirname: path.dirname(scriptPath),
      require: (name) => {
        if (name === 'fs') return {
          existsSync: () => true,
          mkdirSync: (directory) => directories.push(directory),
        };
        if (name === 'path') return pathModule;
        if (name === 'child_process') return {
          spawnSync: (...args) => {
            spawns.push(args);
            return { status: 0 };
          },
        };
        throw new Error(`Unexpected module: ${name}`);
      },
      process: {
        env: parentEnv,
        platform,
        execPath: executable,
        argv: [executable, scriptPath, '--bundles', 'dmg'],
        exit: (code) => {
          exits.push(code);
          throw exitSignal;
        },
      },
      console: { error: (message) => errors.push(message) },
    }, { filename: scriptPath });
  } catch (error) {
    if (error !== exitSignal) throw error;
  }
  assert.deepEqual(exits, [0]);
  assert.deepEqual(errors, []);
  assert.equal(spawns.length, 1);
  return { command: spawns[0][0], args: Array.from(spawns[0][1]), options: spawns[0][2], directories };
}

test('macOS Tauri builds receive a supported locale without changing the parent environment', () => {
  const parentEnv = { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', LC_CTYPE: 'C.UTF-8' };
  const original = { ...parentEnv };
  const build = captureBuild('darwin', parentEnv);
  assert.equal(build.options.env.LC_ALL, 'C');
  assert.equal(build.options.env.LANG, original.LANG);
  assert.equal(build.options.env.LC_CTYPE, original.LC_CTYPE);
  assert.deepEqual(parentEnv, original);
  assert.notEqual(build.options.env, parentEnv);
  assert.deepEqual(build.args.slice(1), ['build', '--bundles', 'dmg']);
  assert.equal(build.options.shell, false);
  assert.deepEqual(build.directories, []);
});

test('Linux Tauri builds preserve the caller environment', () => {
  const parentEnv = { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
  const build = captureBuild('linux', parentEnv);
  assert.deepEqual({ ...build.options.env }, parentEnv);
  assert.notEqual(build.options.env, parentEnv);
  assert.deepEqual(build.directories, []);
});

test('Windows Tauri builds retain Rust, temporary directory and cache configuration', () => {
  const parentEnv = {
    Path: 'C:\\Windows\\System32',
    CARGO_HOME: 'C:\\build-cargo',
    RUSTUP_HOME: 'C:\\build-rustup',
    AI_NOTIFY_TMP_DIR: 'C:\\build-temp',
    npm_config_cache: 'C:\\build-cache',
    LC_ALL: 'C.UTF-8',
  };
  const original = { ...parentEnv };
  const build = captureBuild('win32', parentEnv);
  const env = build.options.env;
  assert.equal(env.LC_ALL, original.LC_ALL);
  assert.equal(env.CARGO_HOME, original.CARGO_HOME);
  assert.equal(env.RUSTUP_HOME, original.RUSTUP_HOME);
  assert.equal(env.Path, 'C:\\build-cargo\\bin;C:\\node;C:\\Windows\\System32');
  assert.equal(env.TEMP, original.AI_NOTIFY_TMP_DIR);
  assert.equal(env.TMP, original.AI_NOTIFY_TMP_DIR);
  assert.equal(env.npm_config_cache, original.npm_config_cache);
  assert.deepEqual(build.directories, [original.AI_NOTIFY_TMP_DIR, original.npm_config_cache]);
  assert.deepEqual(parentEnv, original);
});

test('macOS system Perl starts with the environment forwarded to Tauri', { skip: process.platform !== 'darwin' }, () => {
  const build = captureBuild('darwin', {
    PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', LC_CTYPE: 'C.UTF-8',
  });
  const result = spawnSync('/usr/bin/perl', ['-e', 'print qq(locale-ok\\n)'], {
    env: build.options.env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'locale-ok\n');
  assert.equal(result.stderr, '');
});
