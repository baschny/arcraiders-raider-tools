import { Handle, Position } from 'reactflow';
import type { QuestNodeData } from '../types/quest';
import { TRADER_IMAGES } from '../data/static-data';
import { formatWikiLink, getTraderClass } from '../utils/helpers';
import { useLocale } from '../../../shared/context/LocaleContext';
import {
  getLocalizedMapName,
  getLocalizedTraderName,
  getQuestWikiName,
} from '../utils/localization';

export function QuestNode({ data }: { data: QuestNodeData }) {
  const { locale, t } = useLocale();
  const { quest, isCompleted, isAvailable, isHighlighted, onToggle } = data;
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
    <div className={nodeClass} onClick={handleClick}>
      <Handle type="target" position={Position.Top} />
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
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
