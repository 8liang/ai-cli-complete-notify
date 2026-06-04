const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeConfig } = require('../src/config');

test('summary timeout migrates the old 15s default to 30s', () => {
  const config = normalizeConfig({
    version: 2,
    summary: {
      enabled: true,
      timeoutMs: 15000,
    },
  });

  assert.equal(config.summary.timeoutMs, 30000);
});

test('summary timeout keeps explicit custom values', () => {
  const config = normalizeConfig({
    version: 2,
    summary: {
      enabled: true,
      timeoutMs: 45000,
    },
  });

  assert.equal(config.summary.timeoutMs, 45000);
});
