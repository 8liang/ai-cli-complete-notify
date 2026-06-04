import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppConfig } from '@/lib/types';
import Panel from './ui/Panel';
import Switch from './ui/Switch';

interface Props {
  config: AppConfig;
  onUpdate: (fn: (c: AppConfig) => AppConfig) => void;
}

const PROVIDERS = [
  { value: 'openai', key: 'summary.provider.openai' },
  { value: 'anthropic', key: 'summary.provider.anthropic' },
  { value: 'google', key: 'summary.provider.google' },
  { value: 'qwen', key: 'summary.provider.qwen' },
  { value: 'deepseek', key: 'summary.provider.deepseek' },
];

interface SummaryTestPayload {
  ok?: boolean;
  summary?: string;
  error?: string;
  detail?: string;
  status?: number;
  notification?: {
    skipped?: boolean;
    reason?: string;
    results?: Array<{
      ok?: boolean;
      channel?: string;
      error?: string;
    }>;
  };
}

export default function SummaryPanel({ config, onUpdate }: Props) {
  const { t } = useTranslation();
  const summary = config.summary;
  const webhook = config.channels.webhook;
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [testResultTone, setTestResultTone] = useState<'neutral' | 'success' | 'error'>('neutral');

  const updateSummary = (patch: Partial<AppConfig['summary']>) => {
    onUpdate((c) => ({
      ...c,
      summary: { ...c.summary, ...patch },
    }));
  };

  const updateWebhook = (patch: Partial<AppConfig['channels']['webhook']>) => {
    onUpdate((c) => ({
      ...c,
      channels: {
        ...c.channels,
        webhook: { ...c.channels.webhook, ...patch },
      },
    }));
  };

  const summaryErrorLabel = (error?: string) => {
    const keyByError: Record<string, string> = {
      disabled: 'summary.test.disabled',
      missing_api_url: 'summary.test.missingApiUrl',
      missing_model: 'summary.test.missingModel',
      missing_api_key: 'summary.test.missingApiKey',
      empty_content: 'summary.test.emptyContent',
      invalid_request: 'summary.test.invalidRequest',
      timeout: 'summary.test.timeout',
      network_error: 'summary.test.networkError',
      http_error: 'summary.test.httpError',
      invalid_json: 'summary.test.invalidJson',
      empty_summary: 'summary.test.emptySummary',
    };
    const key = error ? keyByError[error] : '';
    return key ? t(key) : (error || t('summary.test.unexpected'));
  };

  const formatSummaryTestResult = (payload: SummaryTestPayload) => {
    const lines = [];
    if (payload.ok && payload.summary) {
      lines.push(`${t('summary.test.summaryLabel')}${payload.summary}`);
    } else {
      const reason = summaryErrorLabel(payload.error);
      const detail = payload.detail ? ` (${payload.detail})` : '';
      const status = payload.status ? ` HTTP ${payload.status}` : '';
      lines.push(`${t('summary.test.noSummaryLabel')}${reason}${status}${detail}`);
    }

    if (payload.notification) {
      if (payload.notification.skipped) {
        lines.push(`${t('summary.test.notificationSkipped')}${payload.notification.reason || ''}`);
      } else {
        const results = Array.isArray(payload.notification.results) ? payload.notification.results : [];
        const ok = results.filter((item) => item && item.ok).length;
        const total = results.length;
        if (ok > 0) {
          lines.push(`${t('summary.test.notificationSent')}${ok}/${total}`);
        } else {
          const detail = results
            .map((item) => item && item.error ? item.error : '')
            .filter(Boolean)
            .join(' / ');
          lines.push(`${t('summary.test.notificationFailed')}${detail || `${ok}/${total}`}`);
        }
      }
    }

    return lines.join('\n');
  };

  const isSummaryTestSuccess = (payload: SummaryTestPayload) => {
    if (!payload.ok || !payload.summary) return false;
    if (!payload.notification) return true;
    if (payload.notification.skipped) return false;
    const results = Array.isArray(payload.notification.results) ? payload.notification.results : [];
    return results.length > 0 && results.some((item) => item && item.ok);
  };

  const parseSummaryTestPayload = (raw: string) => {
    try {
      return JSON.parse(raw) as SummaryTestPayload;
    } catch (_error) {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) {
        return JSON.parse(raw.slice(start, end + 1)) as SummaryTestPayload;
      }
      throw _error;
    }
  };

  const setSummaryTestError = (message: string) => {
    setTestResult(message);
    setTestResultTone('error');
  };

  const handleTest = async () => {
    if (!summary.apiUrl) { setSummaryTestError(t('summary.test.missingApiUrl')); return; }
    if (!summary.apiKey) { setSummaryTestError(t('summary.test.missingApiKey')); return; }
    if (!summary.model) { setSummaryTestError(t('summary.test.missingModel')); return; }
    setTestResult(t('summary.test.running'));
    setTestResultTone('neutral');
    try {
      const { sidecar } = await import('@/lib/sidecar');
      const out = await sidecar(['summary-test', '--notify']);
      const raw = String(out.stdout || '').trim();
      if (!raw) {
        setSummaryTestError(`${t('summary.test.fail')}: ${out.stderr || t('summary.test.emptySummary')}`);
        return;
      }
      const payload = parseSummaryTestPayload(raw);
      setTestResult(formatSummaryTestResult(payload));
      setTestResultTone(isSummaryTestSuccess(payload) ? 'success' : 'error');
    } catch (e) {
      setSummaryTestError(`${t('summary.test.fail')}: ${e}`);
    }
  };

  const testResultClass = testResultTone === 'success'
    ? 'border-emerald-400/35 bg-emerald-500/[0.10] text-emerald-100'
    : testResultTone === 'error'
      ? 'border-rose-400/35 bg-rose-500/[0.10] text-rose-100'
      : 'border-white/[0.10] bg-white/[0.04] text-muted';

  return (
    <Panel title={t('section.summary.title')} subtitle={t('section.summary.sub')}>
      {/* Header row: enable toggle + provider select */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <label className="text-sm">{t('summary.enabled')}</label>
          <Switch
            checked={summary.enabled}
            onChange={() => updateSummary({ enabled: !summary.enabled })}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted whitespace-nowrap">{t('summary.provider')}</label>
          <select
            value={summary.provider}
            onChange={(e) => updateSummary({ provider: e.target.value })}
            className="min-w-[180px] px-2.5 py-2 rounded-xl border border-white/[0.16] bg-[rgba(6,10,24,0.55)] text-[var(--text)] outline-none text-sm"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{t(p.key)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Fields (collapse when disabled) */}
      {summary.enabled && (
        <div className="mt-3 grid gap-2.5">
          {/* API URL */}
          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2.5 items-center">
            <label className="text-sm">{t('summary.apiUrl')}</label>
            <div className="min-w-0">
              <input
                type="text"
                value={summary.apiUrl}
                onChange={(e) => updateSummary({ apiUrl: e.target.value })}
                placeholder="https://api.openai.com"
                className="w-full min-w-0 px-2.5 py-2 rounded-xl border border-white/[0.16] bg-[rgba(6,10,24,0.55)] text-[var(--text)] outline-none text-sm focus:border-[rgba(110,123,255,0.60)] focus:shadow-[0_0_0_4px_rgba(110,123,255,0.18)]"
              />
              <div className="mt-1.5 text-[11px] leading-relaxed text-muted">
                {t('summary.apiUrlRuleText')}
              </div>
            </div>
          </div>

          {/* API Key */}
          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2.5 items-center">
            <label className="text-sm">{t('summary.apiKey')}</label>
            <div className="flex items-center gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={summary.apiKey}
                onChange={(e) => updateSummary({ apiKey: e.target.value })}
                placeholder="your_api_key"
                className="flex-1 min-w-0 px-2.5 py-2 rounded-xl border border-white/[0.16] bg-[rgba(6,10,24,0.55)] text-[var(--text)] outline-none text-sm focus:border-[rgba(110,123,255,0.60)] focus:shadow-[0_0_0_4px_rgba(110,123,255,0.18)]"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="w-8 h-8 p-0 rounded-[10px] border border-white/[0.14] inline-flex items-center justify-center cursor-pointer"
                style={{
                  background:
                    'radial-gradient(400px 140px at 0% 0%, rgba(110,123,255,0.14), transparent 58%), rgba(255,255,255,0.06)',
                }}
                title={showKey ? t('summary.apiKeyToggle.hide') : t('summary.apiKeyToggle.show')}
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5">
                  <path d="M2 12c2.6-4.2 5.8-6.3 10-6.3s7.4 2.1 10 6.3c-2.6 4.2-5.8 6.3-10 6.3S4.6 16.2 2 12Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  {!showKey && <path d="M4 4L20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
                </svg>
              </button>
            </div>
          </div>

          {/* Model */}
          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2.5 items-center">
            <label className="text-sm">{t('summary.model')}</label>
            <input
              type="text"
              value={summary.model}
              onChange={(e) => updateSummary({ model: e.target.value })}
              placeholder="gpt-4o-mini"
              className="w-full min-w-0 px-2.5 py-2 rounded-xl border border-white/[0.16] bg-[rgba(6,10,24,0.55)] text-[var(--text)] outline-none text-sm"
            />
          </div>

          {/* Timeout */}
          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2.5 items-center">
            <div className="inline-flex items-center gap-1.5">
              <label className="text-sm">{t('summary.timeout')}</label>
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/[0.14] text-[rgba(11,16,34,0.9)] text-[11px] font-extrabold cursor-help border border-white/[0.22]" title={t('summary.timeoutHint')}>?</span>
            </div>
            <input
              type="number"
              min={300}
              step={100}
              value={summary.timeoutMs}
              onChange={(e) => updateSummary({ timeoutMs: Number(e.target.value) || 30000 })}
              className="w-full min-w-0 px-2.5 py-2 rounded-xl border border-white/[0.16] bg-[rgba(6,10,24,0.55)] text-[var(--text)] outline-none text-sm"
            />
          </div>

          {/* Test */}
          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2.5 items-center">
            <label className="text-sm">{t('summary.test')}</label>
            <div className="min-w-0">
              <button
                onClick={handleTest}
                className="px-3 py-1.5 rounded-xl border border-white/[0.14] text-xs cursor-pointer"
                style={{
                  background:
                    'radial-gradient(400px 140px at 0% 0%, rgba(110,123,255,0.14), transparent 58%), rgba(255,255,255,0.06)',
                }}
              >
                {t('summary.testBtn')}
              </button>
              {testResult && (
                <div className={`mt-2 max-w-full whitespace-pre-wrap break-words rounded-xl border px-2.5 py-2 text-xs leading-relaxed ${testResultClass}`}>
                  {testResult}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2.5 items-start">
            <label className="text-sm pt-1">{t('summary.includeOutputWhenSummary')}</label>
            <div className="min-w-0">
              <Switch
                checked={Boolean(webhook.includeOutputWhenSummary)}
                onChange={() => updateWebhook({ includeOutputWhenSummary: !webhook.includeOutputWhenSummary })}
              />
              <div className="mt-1.5 text-[11px] leading-relaxed text-muted">
                {t('summary.includeOutputWhenSummaryHint')}
              </div>
            </div>
          </div>

          <div className="text-xs text-muted leading-relaxed">{t('summary.hint')}</div>
        </div>
      )}
    </Panel>
  );
}
