import { Handle, Position } from 'reactflow';
import { Award, Check, Crosshair, Flag, Lock, MapPin, Sparkles } from 'lucide-react';
import type { QuestUnlockView, UnlockNodeData } from '../types/quest';
import { useLocale } from '../../../shared/context/LocaleContext';

const KIND_ICON: Record<QuestUnlockView['kind'], typeof Flag> = {
  rounds: Flag,
  level: Award,
  location: MapPin,
  damage: Crosshair,
  other: Sparkles,
};

/**
 * A hidden unlock of the game (rounds played, player level, a place to enter, an enemy to
 * damage) as a pill in the quest graph. Clicking toggles it done like a quest. The node takes a
 * quest node's layout cell (same width, top-aligned) with the pill centred in it, so it sits in
 * the quest rows and its edges meet the pill.
 */
export function UnlockNode({ data }: { data: UnlockNodeData }) {
  const { t } = useLocale();
  const { quest, status, isInteractive, isHighlighted, onToggle } = data;
  const unlock = quest.unlock!;
  const Icon = status === 'completed' ? Check : KIND_ICON[unlock.kind];
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isInteractive) onToggle(quest.id);
  };
  return (
    <div className="unlock-node-cell">
      <div
        className={[
          'unlock-node',
          `unlock-node--${status}`,
          isInteractive ? '' : 'read-only',
          isHighlighted ? 'highlighted' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={isInteractive ? handleClick : undefined}
        title={t('quests.unlock.hint')}
        aria-disabled={!isInteractive}
      >
        <Handle type="target" position={Position.Top} id="target-top" />
        <span className="unlock-node__icon">
          <Icon size={18} strokeWidth={2.25} />
        </span>
        <span className="unlock-node__text">
          <span className="unlock-node__kind">
            {status === 'locked' && <Lock size={10} />} {t('quests.unlock.kindLabel')}
          </span>
          <span className="unlock-node__label">{unlock.label}</span>
          {unlock.detail && <span className="unlock-node__detail">{unlock.detail}</span>}
        </span>
        <Handle type="source" position={Position.Bottom} id="source-bottom" />
        <Handle type="source" position={Position.Left} id="source-left" />
        <Handle type="source" position={Position.Right} id="source-right" />
      </div>
    </div>
  );
}
