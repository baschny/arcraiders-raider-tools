import { useEffect, useRef } from 'react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { ItemIcon } from '../../../shared/components/ItemIcon';

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
  onSetCollapsed: (collapsed: boolean) => void;
  onBlueprintClick: (questId: string) => void;
}

export function BlueprintRewardsOverlay({
  entries,
  isCollapsed,
  onSetCollapsed,
  onBlueprintClick,
}: BlueprintRewardsOverlayProps) {
  const { t, tm } = useLocale();
  const completedCount = entries.filter((entry) => entry.isCompleted).length;
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isCollapsed) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!overlayRef.current?.contains(event.target as Node)) {
        onSetCollapsed(true);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isCollapsed, onSetCollapsed]);

  return (
    <div
      ref={overlayRef}
      className={`blueprint-overlay ${isCollapsed ? 'collapsed' : ''}`}
    >
      <button
        type="button"
        className="blueprint-overlay-toggle"
        onClick={() => onSetCollapsed(!isCollapsed)}
        title={isCollapsed ? t('quests.blueprintsToggleShow') : t('quests.blueprintsToggleHide')}
        aria-expanded={!isCollapsed}
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
              <ItemIcon
                itemId={entry.blueprintId}
                name={entry.blueprintName}
                icon={entry.blueprintImageFilename || undefined}
                rarity="Common"
                isBlueprint={true}
                showName={false}
                showQuantity={false}
                style={{ '--item-icon-size': '26px' } as React.CSSProperties}
              />

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
