const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('summary panel renders API URL rule hint below the input', () => {
  const source = fs.readFileSync(path.join(root, 'src-ui', 'components', 'SummaryPanel.tsx'), 'utf8');
  const apiUrlIndex = source.indexOf("t('summary.apiUrl')");
  const ruleIndex = source.indexOf("t('summary.apiUrlRuleText')");

  assert.ok(apiUrlIndex >= 0, 'SummaryPanel should render the API URL field');
  assert.ok(ruleIndex > apiUrlIndex, 'API URL rule hint should be rendered after the API URL field');
});

test('summary panel test action asks the sidecar to send a notification', () => {
  const source = fs.readFileSync(path.join(root, 'src-ui', 'components', 'SummaryPanel.tsx'), 'utf8');

  assert.match(source, /'summary-test'/);
  assert.match(source, /'--notify'/);
});

test('summary panel renders original output toggle below summary test', () => {
  const source = fs.readFileSync(path.join(root, 'src-ui', 'components', 'SummaryPanel.tsx'), 'utf8');
  const testIndex = source.indexOf("t('summary.test')");
  const toggleIndex = source.indexOf("t('summary.includeOutputWhenSummary')");

  assert.ok(testIndex >= 0, 'SummaryPanel should render the summary test row');
  assert.ok(toggleIndex > testIndex, 'Original output toggle should be rendered below the summary test row');
  assert.match(source, /includeOutputWhenSummary/);
});

test('summary panel colors summary test output by result', () => {
  const source = fs.readFileSync(path.join(root, 'src-ui', 'components', 'SummaryPanel.tsx'), 'utf8');

  assert.match(source, /testResultTone/);
  assert.match(source, /border-emerald|text-emerald|bg-emerald/);
  assert.match(source, /border-rose|text-rose|bg-rose/);
});

test('summary URL hint explains trailing slash and hash behavior', () => {
  const zh = JSON.parse(fs.readFileSync(path.join(root, 'src-ui', 'i18n', 'zh-CN.json'), 'utf8'));
  const en = JSON.parse(fs.readFileSync(path.join(root, 'src-ui', 'i18n', 'en.json'), 'utf8'));

  assert.match(zh['summary.apiUrlRuleText'], /\/.*结尾/);
  assert.match(zh['summary.apiUrlRuleText'], /末尾.*#/);
  assert.match(zh['summary.apiUrlRuleText'], /v1\/chat\/completions/);
  assert.match(en['summary.apiUrlRuleText'], /trailing \//i);
  assert.match(en['summary.apiUrlRuleText'], /trailing #/i);
  assert.match(en['summary.apiUrlRuleText'], /v1\/chat\/completions/);
});

test('summary original output toggle copy explains webhook behavior', () => {
  const zh = JSON.parse(fs.readFileSync(path.join(root, 'src-ui', 'i18n', 'zh-CN.json'), 'utf8'));
  const en = JSON.parse(fs.readFileSync(path.join(root, 'src-ui', 'i18n', 'en.json'), 'utf8'));

  assert.match(zh['summary.includeOutputWhenSummary'], /原文|原始输出/);
  assert.match(zh['summary.includeOutputWhenSummaryHint'], /Webhook/);
  assert.match(en['summary.includeOutputWhenSummary'], /original output/i);
  assert.match(en['summary.includeOutputWhenSummaryHint'], /webhook/i);
});
