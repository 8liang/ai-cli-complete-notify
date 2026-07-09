const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('main content scrolls vertically but clips horizontal channel overflow', () => {
  const css = readSource('src-ui/styles/globals.css');
  const match = css.match(/\.content-shell\s*\{([\s\S]*?)\n\}/);

  assert.ok(match, 'content-shell CSS block should exist');
  assert.match(match[1], /overflow-y:\s*auto;/);
  assert.match(match[1], /overflow-x:\s*(hidden|clip);/);
  assert.doesNotMatch(match[1], /overflow:\s*auto;/);
});
