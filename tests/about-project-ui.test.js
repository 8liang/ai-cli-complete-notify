const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('sidebar exposes the About Project page after System', () => {
  const source = readSource('src-ui/components/Sidebar.tsx');
  const systemIndex = source.indexOf("id: 'system'");
  const aboutIndex = source.indexOf("id: 'about-project'");

  assert.ok(systemIndex >= 0, 'System navigation item should exist');
  assert.ok(aboutIndex > systemIndex, 'About Project should appear after System');
  assert.match(source, /key: 'nav\.aboutProject'/);
  assert.match(source, /index: '06'/);
});

test('app renders the About Project panel', () => {
  const source = readSource('src-ui/App.tsx');

  assert.match(source, /AboutProjectPanel/);
  assert.match(source, /activePanel === 'about-project'/);
});

test('about project panel uses local reward and contact QR assets', () => {
  const source = readSource('src-ui/components/AboutProjectPanel.tsx');

  assert.match(source, /alipay-reward\.jpg/);
  assert.match(source, /wechat-pay-reward\.jpg/);
  assert.match(source, /wechat-contact\.jpg/);
  assert.doesNotMatch(source, /telegram/i);
});

test('sidebar does not render a bottom project link', () => {
  const source = readSource('src-ui/components/Sidebar.tsx');

  assert.doesNotMatch(source, /sidebar-footer/);
  assert.doesNotMatch(source, /project-link/);
  assert.doesNotMatch(source, /btn\.projectLink/);
});

test('about project link includes the GitHub logo', () => {
  const source = readSource('src-ui/components/AboutProjectPanel.tsx');
  const buttonIndex = source.indexOf("t('aboutProject.openProject')");
  const logoIndex = source.indexOf('GitHubLogo');

  assert.ok(buttonIndex >= 0, 'About Project should keep the project link button');
  assert.ok(logoIndex >= 0, 'About Project project link should include a GitHub logo component');
  assert.ok(logoIndex < buttonIndex, 'GitHub logo should render before the button text');
});
