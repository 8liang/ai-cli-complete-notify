import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-shell';
import Panel from './ui/Panel';
import alipayRewardQr from '@/assets/author/alipay-reward.jpg';
import wechatPayRewardQr from '@/assets/author/wechat-pay-reward.jpg';
import wechatContactQr from '@/assets/author/wechat-contact.jpg';

const PROJECT_URL = 'https://github.com/ZekerTop/ai-cli-complete-notify';

export default function AboutProjectPanel() {
  const { t } = useTranslation();

  return (
    <Panel
      title={t('section.aboutProject.title')}
      subtitle={t('section.aboutProject.sub')}
      badge={<span className="status-pill is-on">{t('aboutProject.badge')}</span>}
    >
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="surface-card p-5">
            <div className="space-y-5">
              <div>
                <p className="sidebar-kicker">{t('aboutProject.projectLabel')}</p>
                <h3 className="display-font mt-3 text-[30px] leading-tight tracking-[-0.02em]">
                  AI CLI Complete Notify
                </h3>
                <p className="mt-3 max-w-[680px] text-sm leading-relaxed text-muted">
                  {t('aboutProject.projectDesc')}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="surface-card-soft p-4">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-muted">
                    {t('aboutProject.platformLabel')}
                  </div>
                  <div className="mt-2 text-base font-semibold">{t('aboutProject.platformValue')}</div>
                </div>
                <div className="surface-card-soft p-4">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-muted">
                    {t('aboutProject.sourcesLabel')}
                  </div>
                  <div className="mt-2 text-base font-semibold">{t('aboutProject.sourcesValue')}</div>
                </div>
                <div className="surface-card-soft p-4">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-muted">
                    {t('aboutProject.channelsLabel')}
                  </div>
                  <div className="mt-2 text-base font-semibold">{t('aboutProject.channelsValue')}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => open(PROJECT_URL)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[rgba(110,123,255,0.32)] bg-[rgba(110,123,255,0.12)] px-4 py-2.5 text-sm font-medium text-[var(--text)] transition-colors hover:border-[rgba(110,123,255,0.52)] hover:bg-[rgba(110,123,255,0.18)]"
              >
                <GitHubLogo />
                <span>{t('aboutProject.openProject')}</span>
              </button>
            </div>
          </div>

          <div className="surface-card p-5">
            <div className="space-y-4">
              <div>
                <p className="sidebar-kicker">{t('aboutProject.contactLabel')}</p>
                <h3 className="mt-3 text-xl font-semibold">{t('aboutProject.contactTitle')}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{t('aboutProject.contactDesc')}</p>
              </div>
              <div className="rounded-[18px] border border-white/[0.08] bg-white p-3">
                <img
                  src={wechatContactQr}
                  alt={t('aboutProject.wechatContactAlt')}
                  className="mx-auto h-[360px] max-h-[46vh] w-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="surface-card p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sidebar-kicker">{t('aboutProject.rewardLabel')}</p>
              <h3 className="mt-3 text-xl font-semibold">{t('aboutProject.rewardTitle')}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{t('aboutProject.rewardDesc')}</p>
            </div>
            <span className="status-pill">{t('aboutProject.rewardBadge')}</span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <RewardCode
              title={t('aboutProject.alipayTitle')}
              desc={t('aboutProject.alipayDesc')}
              image={alipayRewardQr}
              alt={t('aboutProject.alipayAlt')}
            />
            <RewardCode
              title={t('aboutProject.wechatPayTitle')}
              desc={t('aboutProject.wechatPayDesc')}
              image={wechatPayRewardQr}
              alt={t('aboutProject.wechatPayAlt')}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function GitHubLogo() {
  return (
    <svg viewBox="0 0 16 16" className="h-[15px] w-[15px] shrink-0" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.18-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.45.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

interface RewardCodeProps {
  title: string;
  desc: string;
  image: string;
  alt: string;
}

function RewardCode({ title, desc, image, alt }: RewardCodeProps) {
  return (
    <div className="surface-card-soft p-4">
      <div className="mb-4">
        <h4 className="text-lg font-semibold">{title}</h4>
        <p className="mt-2 text-sm leading-relaxed text-muted">{desc}</p>
      </div>
      <div className="rounded-[18px] border border-white/[0.08] bg-white p-3">
        <img
          src={image}
          alt={alt}
          className="mx-auto h-[420px] max-h-[52vh] w-full object-contain"
        />
      </div>
    </div>
  );
}
