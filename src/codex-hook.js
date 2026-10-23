const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { getDataDir } = require('./paths');

function buildCodexCompletionDedupeKey(sessionId, turnId) {
  if (!sessionId || !turnId) return '';
  const hash = createHash('sha256').update(JSON.stringify([sessionId, turnId])).digest('hex');
  return `codex-complete:${hash}`;
}

function readTranscriptRecords(transcriptPath) {
  if (!transcriptPath) return [];
  let fd;
  try {
    fd = fs.openSync(transcriptPath, 'r');
    const records = [];
    const buffer = Buffer.alloc(256 * 1024);
    const { StringDecoder } = require('string_decoder');
    const decoder = new StringDecoder('utf8');
    let pending = '';
    let bytes;
    // Goal state may precede a long tool output, so scan past the tail window.
    do {
      bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      pending += bytes ? decoder.write(buffer.subarray(0, bytes)) : decoder.end();
      const lines = pending.split('\n');
      pending = bytes ? lines.pop() : '';
      for (const line of lines) {
        try {
          const record = JSON.parse(line);
          if (record?.type === 'session_meta' || (record?.type === 'event_msg'
            && ['task_started', 'task_complete', 'thread_goal_updated'].includes(record.payload?.type))) {
            records.push(record);
          }
        } catch (_error) { /* partial line */ }
      }
    } while (bytes);
    return records;
  } catch (_error) {
    return [];
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
}

function getCodexHookNotificationContext(payload, defaultTaskInfo) {
  if (!payload || !['UserPromptSubmit', 'Stop'].includes(payload.hook_event_name)) {
    return { skip: true, reason: 'Codex only handles UserPromptSubmit and Stop' };
  }
  const sessionId = String(payload.session_id || '').trim();
  const turnId = String(payload.turn_id || '').trim();
  const dedupeKey = buildCodexCompletionDedupeKey(sessionId, turnId);
  if (!dedupeKey) return { skip: true, reason: 'Codex hook requires session_id and turn_id' };

  const timingPath = path.join(getDataDir(), 'codex-timing', `${dedupeKey.slice('codex-complete:'.length)}.json`);
  if (payload.hook_event_name === 'UserPromptSubmit') {
    fs.mkdirSync(path.dirname(timingPath), { recursive: true });
    fs.writeFileSync(timingPath, JSON.stringify({ startedAt: Date.now() }));
    return { skip: true, reason: 'Codex turn started' };
  }

  const records = readTranscriptRecords(payload.transcript_path);
  const meta = records.find((record) => record.type === 'session_meta')?.payload;
  if (meta && (meta.thread_source === 'subagent' || meta.source === 'subagent'
    || (meta.source && typeof meta.source === 'object' && meta.source.subagent))) {
    return { skip: true, reason: 'Codex subagent session skipped' };
  }

  let assistantText = String(payload.last_assistant_message || '').trim();
  let startedAt = null;
  let completedAt = null;
  let goalStatus = '';
  for (const record of records) {
    const event = record.payload || {};
    const eventTurnId = event.turn_id || event.turnId || event.goal?.turn_id || event.goal?.turnId;
    if (record.type === 'event_msg' && event.type === 'thread_goal_updated') {
      if (!eventTurnId || eventTurnId === turnId) goalStatus = event.goal?.status || event.status || '';
    }
    if (eventTurnId && eventTurnId !== turnId) continue;
    if (record.type === 'event_msg' && event.type === 'task_started' && eventTurnId === turnId) {
      const timestamp = Date.parse(record.timestamp);
      if (Number.isFinite(timestamp)) startedAt = timestamp;
    }
    if (record.type === 'event_msg' && event.type === 'task_complete' && eventTurnId === turnId) {
      const timestamp = Date.parse(record.timestamp);
      if (Number.isFinite(timestamp)) completedAt = timestamp;
      if (!assistantText) assistantText = String(event.last_agent_message || event.last_assistant_message || '').trim();
    }
  }
  if (['active', 'paused'].includes(String(goalStatus).toLowerCase())) {
    return { skip: true, reason: `Codex goal ${goalStatus}` };
  }

  let timing = null;
  try { timing = JSON.parse(fs.readFileSync(timingPath, 'utf8')); } catch (_error) { /* no start hook yet */ }
  if (!Number.isFinite(timing?.startedAt) && startedAt != null) timing = { startedAt };
  let durationMs = null;
  if (Number.isFinite(timing?.startedAt)) {
    if (!Number.isFinite(timing.stoppedAt)) {
      timing.stoppedAt = completedAt != null && completedAt >= timing.startedAt ? completedAt : Date.now();
      fs.mkdirSync(path.dirname(timingPath), { recursive: true });
      fs.writeFileSync(timingPath, JSON.stringify(timing));
    }
    durationMs = Math.max(0, timing.stoppedAt - timing.startedAt);
  }
  const defaultTask = String(defaultTaskInfo || '').trim();
  return {
    taskInfo: defaultTask && defaultTask !== '任务已完成' ? defaultTask : 'Codex 完成',
    outputContent: assistantText,
    summaryContext: assistantText ? { assistantMessage: assistantText } : undefined,
    skipSummary: !assistantText,
    dedupeKey,
    durationMs,
  };
}

module.exports = { buildCodexCompletionDedupeKey, getCodexHookNotificationContext };
