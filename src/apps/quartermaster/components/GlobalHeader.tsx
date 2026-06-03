/**
 * Global Header Component
 * See specification section 7.1.2
 */

import { useLocale } from '../../../shared/context/LocaleContext';
import { formatAgeShort } from '../../../shared/utils/ageFormat';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface GlobalHeaderProps {
  stashSyncedAt: string | null;
  loadoutSyncedAt: string | null;
  hideoutSyncedAt: string | null;
  blueprintsSyncedAt: string | null;
  projectsSyncedAt: string | null;
  questsSyncedAt: string | null;
  gameDataSource: 'arctracker' | 'embark';
  embarkSyncedAt: string | null;
  embarkUnknownCount: number;
  isSyncingEmbark: boolean;
  onSyncEmbark: () => void;
}

export function GlobalHeader({
  stashSyncedAt,
  loadoutSyncedAt,
  hideoutSyncedAt,
  blueprintsSyncedAt,
  projectsSyncedAt,
  questsSyncedAt,
  gameDataSource,
  embarkSyncedAt,
  embarkUnknownCount,
  isSyncingEmbark,
  onSyncEmbark,
}: GlobalHeaderProps) {
  const { t } = useLocale();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const ageLabel = (syncedAt: string | null): string =>
    formatAgeShort(syncedAt, nowMs) ?? t('quartermaster.globalHeader.never');

  const syncedMs = embarkSyncedAt ? Date.parse(embarkSyncedAt) : NaN;
  const elapsedSeconds = Number.isFinite(syncedMs)
    ? Math.max(0, Math.floor((nowMs - syncedMs) / 1000))
    : Infinity;
  const syncIsRecent = elapsedSeconds < 3600;

  return (
    <div className="qm-global-header">
      {gameDataSource === 'embark' && (
        <button
          type="button"
          className={`qm-button${syncIsRecent ? '' : ' qm-button--primary'}`}
          onClick={onSyncEmbark}
          disabled={isSyncingEmbark}
          title={t('quartermaster.globalHeader.embarkSyncTooltip')}
        >
          <RefreshCw size={16} className={isSyncingEmbark ? 'animate-spin' : ''} />
          {isSyncingEmbark
            ? t('quartermaster.globalHeader.syncingGameData')
            : t('quartermaster.globalHeader.syncGameData')}
        </button>
      )}

      <div className="qm-global-header__timestamps">
        {gameDataSource === 'embark' ? (
          <>
            <div className="qm-global-header__timestamp">
              {t('quartermaster.globalHeader.source')}: <span>Embark</span>
            </div>
            <div className="qm-global-header__timestamp">
              {t('quartermaster.globalHeader.gameDataLastSync')}:{' '}
              <span>{ageLabel(embarkSyncedAt)}</span>
            </div>
            {embarkUnknownCount > 0 && (
              <div
                className="qm-global-header__timestamp qm-global-header__timestamp--warning"
                title={t('quartermaster.globalHeader.unknownEmbarkIdsTooltip')}
              >
                <AlertTriangle size={14} />
                <span>{t('quartermaster.globalHeader.unknownEmbarkIds')}: {embarkUnknownCount}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <span className="qm-global-header__last-sync">{t('quartermaster.globalHeader.lastSync')}</span>
            <div className="qm-global-header__timestamp">
              {t('quartermaster.globalHeader.stash')}: <span>{ageLabel(stashSyncedAt)}</span>
            </div>
            <div className="qm-global-header__timestamp">
              {t('quartermaster.globalHeader.loadout')}: <span>{ageLabel(loadoutSyncedAt)}</span>
            </div>
            <div className="qm-global-header__timestamp">
              {t('quartermaster.globalHeader.blueprints')}: <span>{ageLabel(blueprintsSyncedAt)}</span>
            </div>
            <div className="qm-global-header__timestamp">
              {t('quartermaster.nav.hideout')}: <span>{ageLabel(hideoutSyncedAt)}</span>
            </div>
            <div className="qm-global-header__timestamp">
              {t('quartermaster.nav.quests')}: <span>{ageLabel(questsSyncedAt)}</span>
            </div>
            <div className="qm-global-header__timestamp">
              {t('quartermaster.nav.projects')}: <span>{ageLabel(projectsSyncedAt)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
