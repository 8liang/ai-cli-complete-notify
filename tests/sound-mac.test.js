const test = require('node:test');
const assert = require('node:assert/strict');

const { getMacTtsProcessSpec } = require('../src/notifiers/sound');

test('macOS TTS uses the say binary instead of invalid inline AppleScript', () => {
  const spec = getMacTtsProcessSpec('AI CLI "sound" test');

  assert.equal(spec.command, 'say');
  assert.deepEqual(spec.args, ['AI CLI "sound" test']);
  assert.equal(spec.args.some((arg) => arg.includes('; beep')), false);
});
