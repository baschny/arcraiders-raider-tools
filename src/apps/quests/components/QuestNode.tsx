import { Handle, Position } from 'reactflow';
import type { QuestNodeData } from '../types/quest';
import {
  BLUEPRINT_QUESTS,
  TRADER_IMAGES,
  MAP_NAME_MAPPING,
} from '../data/static-data';
import { formatWikiLink, getTraderClass } from '../utils/helpers';

export function QuestNode({ data }: { data: QuestNodeData }) {
  const { quest, isCompleted, isAvailable, isHighlighted, onToggle } = data;
  const hasBlueprintReward = BLUEPRINT_QUESTS.has(quest.id);

  const traderClass = getTraderClass(quest.trader);
  const nodeClass = `quest-node ${isCompleted ? 'completed' : ''} ${isAvailable ? 'available' : ''} ${isHighlighted ? 'highlighted' : ''}`;
  const traderImage = TRADER_IMAGES[quest.trader];

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(quest.id);
  };

  return (
    <div className={nodeClass} onClick={handleClick}>
      <Handle type="target" position={Position.Top} />
      {hasBlueprintReward && (
        <div className="blueprint-badge" title="Rewards a Blueprint">
          📜 BP
        </div>
      )}
      <div className="quest-node-header">
        <div className={`trader-icon ${traderClass}`} title={quest.trader}>
          {traderImage ? (
            <img
              src={traderImage}
              alt={quest.trader}
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
              {quest.map.map((m) => MAP_NAME_MAPPING[m] || m).join(', ')}
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
            {isCompleted ? 'Completed' : isAvailable ? 'Available' : 'Locked'}
          </span>
        </div>
        <div className="quest-actions">
          <a
            href={'https://arcraiders.wiki/wiki/' + formatWikiLink(quest.name)}
            target="_blank"
            rel="noopener noreferrer"
            className="quest-action-btn"
            onClick={(e) => e.stopPropagation()}
            title="Open in ARC Raiders Wiki (new tab)"
          >
            📖 Wiki
          </a>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
