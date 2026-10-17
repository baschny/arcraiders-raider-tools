import { useEffect, useRef } from 'react';
import { Handle, Position } from 'reactflow';
import { Check } from 'lucide-react';
import type { QuestNodeData } from '../types/quest';
import { useLocale } from '../../../shared/context/LocaleContext';
import { doneLeafKeys, stepSummary } from '../utils/questSummary';
import { BlueprintThumbs, MapChips, StatusBadge, StepBar, TraderPortrait } from './QuestCardParts';

const MAX_MAPS = 2;

/**
 * Quest in the graph. Clicking it opens the details; the check button toggles completion
 * (manual mode only).
 */
export function QuestNode({ data }: { data: QuestNodeData }) {
  const { t, tm } = useLocale();
  const { quest, status, isInteractive, isHighlighted, objectiveProgress, onToggle, onOpenDetails } = data;
  const nodeRef = useRef<HTMLDivElement>(null);

  // Native listener: a double-click must not reach React Flow's pane, which would zoom in.
  useEffect(() => {
    const element = nodeRef.current;
    if (!element) return;
    const stop = (event: MouseEvent) => event.stopPropagation();
    element.addEventListener('dblclick', stop);
    return () => element.removeEventListener('dblclick', stop);
  }, []);

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    onOpenDetails(quest.id);
  };
  const handleToggle = (event: React.MouseEvent) => {
    event.stopPropagation();
    onToggle(quest.id);
  };

  const completed = status === 'completed';
  const summary = status === 'active' ? stepSummary(quest, doneLeafKeys(quest, objectiveProgress, false)) : null;
  const nodeClass = ['quest-node', `quest-node--${status}`, isHighlighted ? 'highlighted' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={nodeClass} onClick={handleClick} ref={nodeRef}>
      <Handle type="target" position={Position.Top} id="target-top" />
      {quest.isNew && (
        <div className="quest-node__new" title={tm('quests.card.newTitle', { version: quest.addedIn ?? '' })}>
          {tm('quests.card.newBadge', { version: quest.addedIn ?? '' })}
        </div>
      )}
      <div className="quest-node__top">
        <TraderPortrait trader={quest.trader} />
        <div className="quest-node__head">
          <MapChips mapIds={quest.map} max={MAX_MAPS} />
          <div className="quest-node__name">{quest.name}</div>
        </div>
      </div>
      <div className="quest-node__bottom">
        <StatusBadge status={status} />
        {summary && <StepBar done={summary.done} total={summary.required} />}
        {quest.category === 'side' && <span className="quest-node__side">{t('quests.card.side')}</span>}
        <span className="quest-node__rewards">
          <BlueprintThumbs quest={quest} />
          {isInteractive && (
            <button
              type="button"
              className={`quest-node__toggle${completed ? ' is-done' : ''}`}
              onClick={handleToggle}
              title={t(completed ? 'quests.card.markNotDone' : 'quests.card.markDone')}
              aria-label={t(completed ? 'quests.card.markNotDone' : 'quests.card.markDone')}
              aria-pressed={completed}
            >
              <Check size={14} strokeWidth={3} />
            </button>
          )}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} id="source-bottom" />
      <Handle type="source" position={Position.Left} id="source-left" />
      <Handle type="source" position={Position.Right} id="source-right" />
    </div>
  );
}
