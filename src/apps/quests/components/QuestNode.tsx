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
import { QuestTooltip } from '../../../shared/components/QuestTooltip';

const TOOLTIP_ESTIMATED_WIDTH = 440;
const TOOLTIP_ESTIMATED_HEIGHT = 520;
const TOOLTIP_MARGIN = 12;

export function QuestNode({ data }: { data: QuestNodeData }) {
  const { locale, t } = useLocale();
  const {
    quest,
    isCompleted,
    isAvailable,
    status,
    isInteractive,
    isHighlighted,
    objectiveSummary,
    objectiveProgress,
    onToggle,
  } = data;
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
    const frameId = window.requestAnimationFrame(() => {
      updateTooltipPosition();
    });

    const onViewportChange = () => updateTooltipPosition();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.cancelAnimationFrame(frameId);
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
  const nodeClass = [
    'quest-node',
    hasBlueprintReward ? 'has-blueprint' : '',
    isCompleted ? 'completed' : '',
    isAvailable ? 'available' : '',
    status === 'active' ? 'active' : '',
    status === 'unknown' ? 'unknown' : '',
    isInteractive ? '' : 'read-only',
    isHighlighted ? 'highlighted' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const traderImage = TRADER_IMAGES[quest.trader];
  const traderLabel = getLocalizedTraderName(quest.trader, locale);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isInteractive) return;
    onToggle(quest.id);
  };

  return (
    <div
      className={nodeClass}
      onClick={isInteractive ? handleClick : undefined}
      ref={hoverRef}
      aria-disabled={!isInteractive}
    >
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
            {status === 'completed'
              ? '✓'
              : status === 'active' || status === 'available'
                ? '⭐'
                : status === 'unknown'
                  ? '❔'
                  : '🔒'}
          </span>
          <span>
            {status === 'completed'
              ? t('quests.statusCompleted')
              : status === 'active'
                ? t('quests.statusActive')
                : status === 'available'
                  ? t('quests.statusAvailable')
                  : status === 'unknown'
                    ? t('quests.statusUnknown')
                    : t('quests.statusLocked')}
          </span>
        </div>
        {objectiveSummary && status === 'active' && (
          <div className="quest-status-summary">
            {t('quests.objectiveSummary')
              .replace('{completed}', String(objectiveSummary.completed))
              .replace('{total}', String(objectiveSummary.total))}
          </div>
        )}
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
        objectiveProgress={objectiveProgress}
        onMouseEnter={handlers.onMouseEnter}
        onMouseLeave={handlers.onMouseLeave}
        onContextMenu={handlers.onContextMenu}
      />
    </div>
  );
}
