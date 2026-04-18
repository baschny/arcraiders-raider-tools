import { useCallback, useEffect, useState } from 'react';
import { Handle, Position } from 'reactflow';
import type { QuestNodeData } from '../types/quest';
import { TRADER_IMAGES } from '../data/static-data';
import { formatWikiLink, getTraderClass } from '../utils/helpers';
import { useLocale } from '../../../shared/context/LocaleContext';
import { useHoverIntent } from '../../../shared/hooks/useHoverIntent';
import {
  getLocalizedMapName,
  getLocalizedTraderName,
  getQuestWikiName,
} from '../utils/localization';
import { QuestTooltip } from './QuestTooltip';

const TOOLTIP_ESTIMATED_WIDTH = 440;
const TOOLTIP_ESTIMATED_HEIGHT = 520;
const TOOLTIP_MARGIN = 12;

export function QuestNode({ data }: { data: QuestNodeData }) {
  const { locale, t } = useLocale();
  const { quest, isCompleted, isAvailable, isHighlighted, onToggle } = data;
  const { ref: hoverRef, isHovered, handlers } = useHoverIntent<HTMLDivElement>({
    delayShow: 400,
    delayHide: 120,
  });
  const [tooltipPosition, setTooltipPosition] = useState({
    x: 0,
    y: 0,
    maxHeight: TOOLTIP_ESTIMATED_HEIGHT,
  });

  const updateTooltipPosition = useCallback(() => {
    const element = hoverRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = rect.right + 10;
    let y = rect.top;

    if (x + TOOLTIP_ESTIMATED_WIDTH > viewportWidth - TOOLTIP_MARGIN) {
      x = rect.left - TOOLTIP_ESTIMATED_WIDTH - 10;
    }
    if (x < TOOLTIP_MARGIN) {
      x = TOOLTIP_MARGIN;
    }

    if (y + TOOLTIP_ESTIMATED_HEIGHT > viewportHeight - TOOLTIP_MARGIN) {
      y = viewportHeight - TOOLTIP_ESTIMATED_HEIGHT - TOOLTIP_MARGIN;
    }
    if (y < TOOLTIP_MARGIN) {
      y = TOOLTIP_MARGIN;
    }

    const maxHeight = Math.max(260, viewportHeight - y - TOOLTIP_MARGIN);
    setTooltipPosition({ x, y, maxHeight });
  }, [hoverRef]);

  useEffect(() => {
    if (!isHovered) return;
    updateTooltipPosition();

    const onViewportChange = () => updateTooltipPosition();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [isHovered, updateTooltipPosition]);
  const hasBlueprintReward = quest.hasBlueprint;
  const blueprintRewardTooltip =
    quest.blueprintRewards.length > 0
      ? t('quests.rewardsList').replace(
          '{rewards}',
          quest.blueprintRewards.map((reward) => reward.name).join(', ')
        )
      : t('quests.rewardsBlueprint');

  const traderClass = getTraderClass(quest.trader);
  const nodeClass = `quest-node ${hasBlueprintReward ? 'has-blueprint' : ''} ${isCompleted ? 'completed' : ''} ${isAvailable ? 'available' : ''} ${isHighlighted ? 'highlighted' : ''}`;
  const traderImage = TRADER_IMAGES[quest.trader];
  const traderLabel = getLocalizedTraderName(quest.trader, locale);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(quest.id);
  };

  return (
    <div className={nodeClass} onClick={handleClick} ref={hoverRef}>
      <Handle type="target" position={Position.Top} id="target-top" />
      {hasBlueprintReward && (
        <div className="blueprint-badge" title={blueprintRewardTooltip}>
          📜 BP
        </div>
      )}
      <div className="quest-node-header">
        <div className={`trader-icon ${traderClass}`} title={traderLabel}>
          {traderImage ? (
            <img
              src={traderImage}
              alt={traderLabel}
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                objectFit: 'cover',
              }}
            />
          ) : (
            quest.trader
              .split(' ')
              .map((w) => w[0])
              .join('')
          )}
        </div>
          <div className="quest-info">
            {quest.map && quest.map.length > 0 && (
              <div className="quest-map-info">
                {quest.map.map((mapId) => getLocalizedMapName(mapId, locale)).join(', ')}
              </div>
            )}
            <div className="quest-name">{quest.name}</div>
        </div>
      </div>

      <div className="quest-node-footer">
        <div className="quest-status">
          <span className="status-icon">
            {isCompleted ? '✓' : isAvailable ? '⭐' : '🔒'}
          </span>
          <span>
            {isCompleted
              ? t('quests.statusCompleted')
              : isAvailable
                ? t('quests.statusAvailable')
                : t('quests.statusLocked')}
          </span>
        </div>
        <div className="quest-actions">
          <a
            href={'https://arcraiders.wiki/wiki/' + formatWikiLink(getQuestWikiName(quest))}
            target="_blank"
            rel="noopener noreferrer"
            className="quest-action-btn"
            onClick={(e) => e.stopPropagation()}
            title={t('quests.wikiTitle')}
          >
            📖 {t('quests.wikiLabel')}
          </a>
          <a
            href={`https://arctracker.io/quests/${quest.id.replaceAll('_', '-')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="quest-action-btn"
            onClick={(e) => e.stopPropagation()}
            title={t('quests.arcTrackerTitle')}
          >
            🛰️ {t('quests.arcTrackerLabel')}
          </a>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} id="source-bottom" />
      <Handle type="source" position={Position.Left} id="source-left" />
      <Handle type="source" position={Position.Right} id="source-right" />
      <QuestTooltip
        quest={quest}
        position={tooltipPosition}
        visible={isHovered}
        onMouseEnter={handlers.onMouseEnter}
        onMouseLeave={handlers.onMouseLeave}
        onContextMenu={handlers.onContextMenu}
      />
    </div>
  );
}
