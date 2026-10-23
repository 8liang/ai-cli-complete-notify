const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const {
  getCodexHookNotificationContext,
  buildCodexCompletionDedupeKey,
} = require('../src/codex-hook');

const projectRoot = path.resolve(__dirname, '..');

function createSandbox(t) {
  const target = path.join(projectRoot, 'src-tauri', 'target');
  fs.mkdirSync(target, { recursive: true });
  const sandbox = fs.mkdtempSync(path.join(target, 'codex-context-'));
  const previous = process.env.AI_CLI_COMPLETE_NOTIFY_DATA_DIR;
  process.env.AI_CLI_COMPLETE_NOTIFY_DATA_DIR = sandbox;
  t.after(() => {
    if (previous === undefined) delete process.env.AI_CLI_COMPLETE_NOTIFY_DATA_DIR;
    else process.env.AI_CLI_COMPLETE_NOTIFY_DATA_DIR = previous;
    fs.rmSync(sandbox, { recursive: true, force: true });
  });
  return sandbox;
}

function stopPayload(sandbox, overrides = {}) {
  return {
    hook_event_name: 'Stop',
    session_id: 'session-a',
    turn_id: 'turn-a',
    cwd: sandbox,
    last_assistant_message: 'Implemented the requested change.',
    ...overrides,
  };
}

function transcript(sandbox, records) {
  const file = path.join(sandbox, 'session.jsonl');
  fs.writeFileSync(file, records.map((record) => JSON.stringify(record)).join('\n') + '\n');
  return file;
}

test('Codex Stop context uses the final assistant message and session/turn identity', (t) => {
  const sandbox = createSandbox(t);
  const payload = stopPayload(sandbox);
  const context = getCodexHookNotificationContext(payload, 'custom completion');
  assert.equal(Boolean(context.skip), false);
  assert.equal(context.taskInfo, 'custom completion');
  assert.equal(context.outputContent, payload.last_assistant_message);
  assert.equal(context.summaryContext.assistantMessage, payload.last_assistant_message);
  assert.equal(context.dedupeKey, buildCodexCompletionDedupeKey(payload.session_id, payload.turn_id));
  assert.equal(context.durationMs, null);
});

test('Codex only accepts valid Stop payloads for completion notifications', (t) => {
  const sandbox = createSandbox(t);
  for (const payload of [
    null, {}, [],
    stopPayload(sandbox, { hook_event_name: 'PreToolUse' }),
    stopPayload(sandbox, { session_id: undefined }),
    stopPayload(sandbox, { session_id: '' }),
    stopPayload(sandbox, { turn_id: undefined }),
    stopPayload(sandbox, { turn_id: '' }),
  ]) {
    assert.equal(getCodexHookNotificationContext(payload, 'task').skip, true, JSON.stringify(payload));
  }
});

test('Codex completion dedupe separates sessions and turns even when outputs are identical', (t) => {
  const sandbox = createSandbox(t);
  const payload = stopPayload(sandbox, { last_assistant_message: 'Done.' });
  const first = getCodexHookNotificationContext(payload, 'task');
  const changedText = getCodexHookNotificationContext({ ...payload, last_assistant_message: 'Reworded.' }, 'task');
  const otherSession = getCodexHookNotificationContext({ ...payload, session_id: 'session-b' }, 'task');
  const otherTurn = getCodexHookNotificationContext({ ...payload, turn_id: 'turn-b' }, 'task');
  assert.equal(first.dedupeKey, changedText.dedupeKey);
  assert.notEqual(first.dedupeKey, otherSession.dedupeKey);
  assert.notEqual(first.dedupeKey, otherTurn.dedupeKey);
  assert.notEqual(buildCodexCompletionDedupeKey('a:b', 'c'), buildCodexCompletionDedupeKey('a', 'b:c'));
});

test('Codex prompt timing is isolated by session and turn and repeated Stop freezes duration', (t) => {
  const sandbox = createSandbox(t);
  const payload = stopPayload(sandbox);
  const started = getCodexHookNotificationContext({ ...payload, hook_event_name: 'UserPromptSubmit' }, 'task');
  assert.equal(started.skip, true);
  const key = createHash('sha256').update(JSON.stringify([payload.session_id, payload.turn_id])).digest('hex');
  const timerPath = path.join(sandbox, 'codex-timing', `${key}.json`);
  assert.equal(Number.isFinite(JSON.parse(fs.readFileSync(timerPath)).startedAt), true);
  fs.writeFileSync(timerPath, JSON.stringify({ startedAt: Date.now() - 360000 }));
  assert.equal(getCodexHookNotificationContext({ ...payload, session_id: 'other-session' }, 'task').durationMs, null);
  assert.equal(getCodexHookNotificationContext({ ...payload, turn_id: 'other-turn' }, 'task').durationMs, null);
  const stopped = getCodexHookNotificationContext(payload, 'task');
  assert.ok(stopped.durationMs >= 360000 && stopped.durationMs < 365000);
  const saved = JSON.parse(fs.readFileSync(timerPath));
  assert.equal(Number.isFinite(saved.stoppedAt), true);
  assert.equal(getCodexHookNotificationContext(payload, 'task').durationMs, stopped.durationMs);
  assert.deepEqual(JSON.parse(fs.readFileSync(timerPath)), saved);
});

test('Codex transcript metadata filters subagents and guardian sessions', (t) => {
  const sandbox = createSandbox(t);
  for (const metadata of [
    { source: 'subagent' },
    { thread_source: 'subagent' },
    { source: { subagent: { other: 'guardian' } } },
    { source: { subagent: { thread_spawn: { parent_thread_id: 'parent' } } } },
  ]) {
    const transcriptPath = transcript(sandbox, [{ type: 'session_meta', payload: { id: 'session-a', ...metadata } }]);
    const context = getCodexHookNotificationContext(stopPayload(sandbox, { transcript_path: transcriptPath }), 'task');
    assert.equal(context.skip, true, JSON.stringify(metadata));
  }
});

test('Codex delayed async Stop uses the matching task completion time for its threshold', (t) => {
  const sandbox = createSandbox(t);
  const startedAt = Date.now() - 6 * 60 * 1000;
  const completedAt = startedAt + 10000;
  const transcriptPath = transcript(sandbox, [
    { type: 'event_msg', timestamp: new Date(startedAt).toISOString(), payload: { type: 'task_started', turn_id: 'turn-a' } },
    { type: 'event_msg', timestamp: new Date(completedAt).toISOString(), payload: { type: 'task_complete', turn_id: 'turn-a' } },
    { type: 'event_msg', timestamp: new Date().toISOString(), payload: { type: 'task_complete', turn_id: 'other-turn' } },
  ]);
  const context = getCodexHookNotificationContext(stopPayload(sandbox, { transcript_path: transcriptPath }), 'task');
  assert.equal(context.durationMs, 10000);
  const { shouldNotifyByDuration } = require('../src/engine');
  assert.equal(shouldNotifyByDuration({ minDurationMinutes: 5, durationMs: context.durationMs, force: false }).should, false);
});

test('Codex goals suppress active and paused turns and allow completed goals', (t) => {
  const sandbox = createSandbox(t);
  for (const status of ['active', 'paused', 'completed']) {
    const transcriptPath = transcript(sandbox, [
      { type: 'session_meta', payload: { id: 'session-a', source: 'cli' } },
      { type: 'event_msg', payload: { type: 'thread_goal_updated', goal: { status, turn_id: 'turn-a' } } },
    ]);
    const context = getCodexHookNotificationContext(stopPayload(sandbox, { transcript_path: transcriptPath }), 'task');
    assert.equal(Boolean(context.skip), status !== 'completed', status);
  }
});

test('Codex keeps goal state in the middle of long transcripts until a terminal update', (t) => {
  const sandbox = createSandbox(t);
  for (const status of ['active', 'paused']) {
    const transcriptPath = transcript(sandbox, [
      { type: 'session_meta', payload: { id: 'session-a', source: 'cli' } },
      { type: 'response_item', payload: { type: 'function_call_output', output: 'x'.repeat(70 * 1024) } },
      { type: 'event_msg', payload: { type: 'thread_goal_updated', goal: { status, turn_id: 'turn-a' } } },
      { type: 'response_item', payload: { type: 'function_call_output', output: 'y'.repeat(640 * 1024) } },
    ]);
    const payload = stopPayload(sandbox, { transcript_path: transcriptPath });
    assert.ok(fs.statSync(transcriptPath).size > 600 * 1024);
    assert.equal(getCodexHookNotificationContext(payload, 'task').skip, true, status);
    fs.appendFileSync(transcriptPath, JSON.stringify({
      type: 'event_msg',
      payload: { type: 'thread_goal_updated', goal: { status: 'complete', turn_id: 'turn-a' } },
    }) + '\n');
    const completed = getCodexHookNotificationContext(payload, 'task');
    assert.equal(Boolean(completed.skip), false, `${status} followed by complete`);
    assert.equal(completed.outputContent, payload.last_assistant_message);
  }
});
