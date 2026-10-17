import type { CSSProperties } from 'react';
import { Map as MapIcon } from 'lucide-react';
import type { Quest } from '../types/quest';
import { useLocale } from '../../../shared/context/LocaleContext';
import { getQuestMapIndicator } from '../utils/mapMeta';

interface SidebarProps {
  actualQuests: Quest[];
  availableQuests: Quest[];
  completedCount: number;
  readOnly: boolean;
  onQuestClick: (questId: string) => void;
  onResetAll: () => void;
}

export function Sidebar({
  actualQuests,
  availableQuests,
  completedCount,
  readOnly,
  onQuestClick,
  onResetAll,
}: SidebarProps) {
  const { locale, t } = useLocale();
  const totalQuests = actualQuests.length;
  const availableCount = availableQuests.length;
  const lockedCount = Math.max(totalQuests - completedCount - availableCount, 0);
  const completedPercent = totalQuests > 0 ? (completedCount / totalQuests) * 100 : 0;
  const availablePercent = totalQuests > 0 ? (availableCount / totalQuests) * 100 : 0;
  const lockedPercent = totalQuests > 0 ? (lockedCount / totalQuests) * 100 : 0;
  return (
    <div className="available-sidebar">
      <div
        className="sidebar-progress"
        role="img"
        aria-label={`${t('quests.sidebarCompleted')}: ${completedCount}/${totalQuests}, ${t('quests.sidebarAvailable')}: ${availableCount}, ${t('quests.sidebarLocked')}: ${lockedCount}`}
      >
        <div className="sidebar-progress-bar">
          {completedPercent > 0 && (
            <div
              className="sidebar-progress-segment is-completed"
              style={{ width: `${completedPercent}%` }}
            />
          )}
          {availablePercent > 0 && (
            <div
              className="sidebar-progress-segment is-available"
              style={{ width: `${availablePercent}%` }}
            />
          )}
          {lockedPercent > 0 && (
            <div
              className="sidebar-progress-segment is-locked"
              style={{ width: `${lockedPercent}%` }}
            />
          )}
        </div>
        <div className="sidebar-progress-tooltip" role="tooltip">
          <div className="sidebar-progress-tooltip-row">
            <span className="sidebar-progress-swatch is-completed" aria-hidden="true" />
            <span className="sidebar-progress-tooltip-label">
              {t('quests.sidebarCompleted')}
            </span>
            <span className="sidebar-progress-tooltip-value">
              {completedCount} / {totalQuests}
            </span>
          </div>
          <div className="sidebar-progress-tooltip-row">
            <span className="sidebar-progress-swatch is-available" aria-hidden="true" />
            <span className="sidebar-progress-tooltip-label">
              {t('quests.sidebarAvailable')}
            </span>
            <span className="sidebar-progress-tooltip-value">{availableCount}</span>
          </div>
          <div className="sidebar-progress-tooltip-row">
            <span className="sidebar-progress-swatch is-locked" aria-hidden="true" />
            <span className="sidebar-progress-tooltip-label">
              {t('quests.sidebarLocked')}
            </span>
            <span className="sidebar-progress-tooltip-value">{lockedCount}</span>
          </div>
        </div>
      </div>

      <div className="available-sidebar-header">
        <span>⭐ {t('quests.sidebarAvailableHeader')}</span>
        {!readOnly && completedCount > 0 && (
          <button
            className="reset-all-button"
            onClick={onResetAll}
            title={t('quests.sidebarResetAllTitle')}
          >
            {t('quests.sidebarResetAll')}
          </button>
        )}
      </div>

      <div className="available-quests-list available-quests-list--available">
        {availableQuests.length === 0 ? (
          <div className="no-available-quests">
            {t('quests.sidebarNoAvailable')}
          </div>
        ) : (
          availableQuests.map((quest) => {
            const mapIndicator = getQuestMapIndicator(quest.map, locale);
            const isSplit =
              mapIndicator?.segments &&
              mapIndicator.segments.length >= 2 &&
              mapIndicator.segments.length <= 3;

            const indicatorStyle =
              mapIndicator && !isSplit
                ? ({
                    '--map-accent': mapIndicator.accentColor,
                    ...(mapIndicator.backgroundImage
                      ? { backgroundImage: `url(${mapIndicator.backgroundImage})` }
                      : {}),
                  } as CSSProperties)
                : undefined;
            return (
              <div
                key={quest.id}
                className="available-quest-item"
                onClick={() => onQuestClick(quest.id)}
                title={t('quests.sidebarFocusQuest')}
              >
                <div className="available-quest-name">{quest.name}</div>
                {mapIndicator && (
                  <div
                    className={`available-quest-map${mapIndicator.isMultiple ? ' is-multiple' : ''}${isSplit ? ` is-split-${mapIndicator.segments?.length}` : ''}`}
                    style={indicatorStyle}
                    title={mapIndicator.names.join(', ')}
                    aria-label={mapIndicator.names.join(', ')}
                  >
                    {isSplit &&
                      mapIndicator.segments?.map((segment) => (
                        <div
                          key={segment.slug}
                          className="available-quest-map-segment"
                          style={
                            {
                              '--map-accent': segment.accentColor,
                              backgroundImage: `url(${segment.backgroundImage})`,
                            } as CSSProperties
                          }
                        />
                      ))}
                    {mapIndicator.isMultiple && !isSplit && (
                      <div className="multiple-maps-content">
                        <MapIcon size={14} aria-hidden="true" />
                        {mapIndicator.mapCount >= 4 && (
                          <span className="map-count">{mapIndicator.mapCount}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
