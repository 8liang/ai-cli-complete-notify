const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const https = require('node:https');
const test = require('node:test');

test('Feishu card keeps Codex output content in interactive payload', async (t) => {
  const originalRequest = https.request;
  const previousEnv = {
    WEBHOOK_USE_FEISHU_CARD: process.env.WEBHOOK_USE_FEISHU_CARD,
    WEBHOOK_FORMAT: process.env.WEBHOOK_FORMAT,
  };
  let postedPayload = null;

  t.after(() => {
    https.request = originalRequest;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  delete process.env.WEBHOOK_USE_FEISHU_CARD;
  delete process.env.WEBHOOK_FORMAT;

  https.request = (_options, callback) => {
    let body = '';
    const req = new EventEmitter();
    req.write = (chunk) => {
      body += chunk.toString();
    };
    req.end = () => {
      postedPayload = JSON.parse(body);
      const res = new EventEmitter();
      res.statusCode = 200;
      callback(res);
      res.emit('data', Buffer.from(JSON.stringify({ code: 0, msg: 'success' })));
      res.emit('end');
    };
    req.setTimeout = () => {};
    req.destroy = () => {};
    return req;
  };

  delete require.cache[require.resolve('../src/notifiers/webhook')];
  const { notifyWebhook } = require('../src/notifiers/webhook');

  const result = await notifyWebhook({
    config: {
      channels: {
        webhook: {
          urls: ['https://open.feishu.cn/open-apis/bot/v2/hook/test'],
          useFeishuCard: true,
        },
      },
    },
    title: '[Codex] app: Codex 完成',
    contentText: 'Completed at: 2026/6/2 10:00:00\nSource: Codex',
    projectName: 'app',
    timestamp: '2026/6/2 10:00:00',
    durationText: '1s',
    sourceLabel: 'Codex',
    taskInfo: 'Codex 完成',
    outputContent: 'Codex final answer for Feishu card',
    summaryUsed: false,
  });

  assert.equal(result.ok, true);
  assert.equal(postedPayload.msg_type, 'interactive');
  assert.match(JSON.stringify(postedPayload.card), /Codex final answer for Feishu card/);
});

test('Feishu card keeps original output when summary is also present', async (t) => {
  const originalRequest = https.request;
  const previousEnv = {
    WEBHOOK_USE_FEISHU_CARD: process.env.WEBHOOK_USE_FEISHU_CARD,
    WEBHOOK_FORMAT: process.env.WEBHOOK_FORMAT,
  };
  let postedPayload = null;

  t.after(() => {
    https.request = originalRequest;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  delete process.env.WEBHOOK_USE_FEISHU_CARD;
  delete process.env.WEBHOOK_FORMAT;

  https.request = (_options, callback) => {
    let body = '';
    const req = new EventEmitter();
    req.write = (chunk) => {
      body += chunk.toString();
    };
    req.end = () => {
      postedPayload = JSON.parse(body);
      const res = new EventEmitter();
      res.statusCode = 200;
      callback(res);
      res.emit('data', Buffer.from(JSON.stringify({ code: 0, msg: 'success' })));
      res.emit('end');
    };
    req.setTimeout = () => {};
    req.destroy = () => {};
    return req;
  };

  delete require.cache[require.resolve('../src/notifiers/webhook')];
  const { notifyWebhook } = require('../src/notifiers/webhook');

  const result = await notifyWebhook({
    config: {
      channels: {
        webhook: {
          urls: ['https://open.feishu.cn/open-apis/bot/v2/hook/test'],
          useFeishuCard: true,
        },
      },
    },
    title: '[Codex] app: brief summary',
    contentText: 'Completed at: 2026/6/2 10:00:00\nSource: Codex',
    projectName: 'app',
    timestamp: '2026/6/2 10:00:00',
    durationText: '1s',
    sourceLabel: 'Codex',
    taskInfo: 'brief summary',
    outputContent: 'Full Codex answer should still be visible',
    summaryUsed: true,
  });

  const cardText = JSON.stringify(postedPayload.card);
  assert.equal(result.ok, true);
  assert.match(cardText, /brief summary/);
  assert.match(cardText, /Full Codex answer should still be visible/);
});
