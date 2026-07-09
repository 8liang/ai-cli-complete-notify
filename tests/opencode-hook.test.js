const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');

const { getHookConfigPreview } = require('../src/hooks');
const { getOpenCodeHookNotificationContext } = require('../src/hook-context');

async function readSpawnStdin(stdin) {
  if (!stdin) return '';
  if (typeof stdin === 'string') return stdin;
  if (Buffer.isBuffer(stdin)) return stdin.toString('utf8');
  if (stdin instanceof Uint8Array) return Buffer.from(stdin).toString('utf8');

  if (typeof stdin.getReader === 'function') {
    const reader = stdin.getReader();
    const chunks = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  throw new Error('Unsupported stdin type');
}

async function loadOpenCodePlugin() {
  const source = getHookConfigPreview('opencode');
  const transformed = source.replace(
    'export const AiCliCompleteNotifyPlugin =',
    'exports.AiCliCompleteNotifyPlugin =',
  );
  const spawns = [];
  const context = {
    exports: {},
    process: {
      env: {},
      platform: 'linux',
    },
    Bun: {
      spawn: (args) => {
        spawns.push(args);
        return { exited: Promise.resolve(), exitCode: 0 };
      },
    },
    Response,
    TextEncoder,
    setTimeout,
  };

  vm.runInNewContext(transformed, context);
  return { pluginFactory: context.exports.AiCliCompleteNotifyPlugin, spawns };
}

test('opencode plugin notifies when session.status becomes idle', async () => {
  const { pluginFactory, spawns } = await loadOpenCodePlugin();
  const client = {
    session: {
      messages: async () => ({
        data: [
          { role: 'user', content: 'build it' },
          { role: 'assistant', content: 'Implemented the OpenCode fix.' },
        ],
      }),
    },
  };
  const plugin = await pluginFactory({
    client,
    project: { name: 'notify-project' },
    directory: '/repo',
    worktree: '/repo',
  });

  await plugin.event({
    event: {
      type: 'session.status',
      sessionID: 'session-1',
      properties: { status: { type: 'idle' } },
      cwd: '/repo',
    },
  });

  assert.equal(spawns.length, 1);
  const payload = JSON.parse(await readSpawnStdin(spawns[0].stdin));
  assert.equal(payload.hook_event_name, 'session.status');
  assert.equal(payload.session_id, 'session-1');
  assert.equal(payload.task_info, 'Implemented the OpenCode fix.');
  assert.equal(payload.output_content, 'Implemented the OpenCode fix.');
});

test('opencode hook context accepts idle session.status payloads', () => {
  const context = getOpenCodeHookNotificationContext({
    hook_source: 'opencode-plugin',
    hook_event_name: 'session.status',
    task_info: 'Implemented the OpenCode fix.',
    output_content: 'Implemented the OpenCode fix.',
  }, 'Implemented the OpenCode fix.');

  assert.deepEqual(context, {
    taskInfo: 'Implemented the OpenCode fix.',
    outputContent: 'Implemented the OpenCode fix.',
    summaryContext: { assistantMessage: 'Implemented the OpenCode fix.' },
    skipSummary: false,
    delayMs: 0,
  });
});
