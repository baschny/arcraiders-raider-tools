import { useLocale } from '../../../shared/context/LocaleContext';

interface BlueprintRewardListEntry {
  questId: string;
  questName: string;
  blueprintId: string;
  blueprintName: string;
  blueprintImageFilename: string;
  isCompleted: boolean;
}

interface BlueprintRewardsOverlayProps {
  entries: BlueprintRewardListEntry[];
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onBlueprintClick: (questId: string) => void;
}

export function BlueprintRewardsOverlay({
  entries,
  isCollapsed,
  onToggleCollapsed,
  onBlueprintClick,
}: BlueprintRewardsOverlayProps) {
  const { t, tm } = useLocale();
  const completedCount = entries.filter((entry) => entry.isCompleted).length;

  return (
    <div className={`blueprint-overlay ${isCollapsed ? 'collapsed' : ''}`}>
      <button
        type="button"
        className="blueprint-overlay-toggle"
        onClick={onToggleCollapsed}
        title={isCollapsed ? t('quests.blueprintsToggleShow') : t('quests.blueprintsToggleHide')}
      >
        <span className="blueprint-overlay-toggle-icon">📜</span>
        <span className="blueprint-overlay-toggle-label">
          {tm('quests.blueprintsLabel', { completed: completedCount, total: entries.length })}
        </span>
        <span className="blueprint-overlay-toggle-chevron">
          {isCollapsed ? '▾' : '▴'}
        </span>
      </button>

      {!isCollapsed && (
        <div className="blueprint-overlay-list">
          {entries.map((entry) => (
            <button
              key={`${entry.questId}-${entry.blueprintId}`}
              type="button"
              className={`blueprint-overlay-item ${entry.isCompleted ? 'completed' : ''}`}
              onClick={() => onBlueprintClick(entry.questId)}
              title={tm('quests.blueprintsJumpToQuest', { quest: entry.questName })}
            >
              {entry.blueprintImageFilename ? (
                <img
                  className="blueprint-overlay-item-icon"
                  src={entry.blueprintImageFilename}
                  alt={entry.blueprintName}
                  loading="lazy"
                />
              ) : (
                <span className="blueprint-overlay-item-icon blueprint-overlay-item-icon-fallback">
                  📜
                </span>
              )}

              <span className="blueprint-overlay-item-text">
                <span className="blueprint-overlay-item-name">
                  {entry.blueprintName}
                </span>
                <span className="blueprint-overlay-item-quest">{entry.questName}</span>
              </span>

              {entry.isCompleted && (
                <span className="blueprint-overlay-item-check" aria-label={t('quests.completedLabel')}>
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
