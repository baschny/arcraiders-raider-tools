import { useCallback, useEffect, useRef, useState } from 'react';
import { Handle, Position } from 'reactflow';
import type { QuestNodeData } from '../types/quest';
import { useLocale } from '../../../shared/context/LocaleContext';
import { useHoverIntent } from '../../../shared/hooks/useHoverIntent';
import { doneLeafKeys, stepSummary } from '../utils/questSummary';
import { BlueprintThumbs, MapChips, StatusBadge, StepBar, TraderPortrait, XpValue } from './QuestCardParts';
import { QuestHoverCard } from './QuestHoverCard';

const HOVER_ESTIMATED_WIDTH = 320;
const HOVER_ESTIMATED_HEIGHT = 380;
const HOVER_MARGIN = 12;
/** A click waits this long for a second click before it toggles the quest (double-click opens the details). */
const DOUBLE_CLICK_MS = 250;
const MAX_MAPS = 2;

export function QuestNode({ data }: { data: QuestNodeData }) {
  const { t, tm } = useLocale();
  const { quest, status, isInteractive, isHighlighted, objectiveProgress, onToggle, onOpenDetails } = data;
  const { ref: hoverRef, isHovered, handlers } = useHoverIntent<HTMLDivElement>({
    delayShow: 400,
    delayHide: 120,
  });
  const closeHover = handlers.close;
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0, maxHeight: HOVER_ESTIMATED_HEIGHT });
  const clickTimer = useRef<number | undefined>(undefined);

  const updateHoverPosition = useCallback(() => {
    const element = hoverRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    let x = rect.right + 10;
    let y = rect.top;
    if (x + HOVER_ESTIMATED_WIDTH > window.innerWidth - HOVER_MARGIN) x = rect.left - HOVER_ESTIMATED_WIDTH - 10;
    if (x < HOVER_MARGIN) x = HOVER_MARGIN;
    if (y + HOVER_ESTIMATED_HEIGHT > window.innerHeight - HOVER_MARGIN) y = window.innerHeight - HOVER_ESTIMATED_HEIGHT - HOVER_MARGIN;
    if (y < HOVER_MARGIN) y = HOVER_MARGIN;
    setHoverPosition({ x, y, maxHeight: Math.max(260, window.innerHeight - y - HOVER_MARGIN) });
  }, [hoverRef]);

  useEffect(() => {
    if (!isHovered) return;
    const frameId = window.requestAnimationFrame(updateHoverPosition);
    window.addEventListener('resize', updateHoverPosition);
    window.addEventListener('scroll', updateHoverPosition, true);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updateHoverPosition);
      window.removeEventListener('scroll', updateHoverPosition, true);
    };
  }, [isHovered, updateHoverPosition]);

  const openDetails = useCallback(() => {
    window.clearTimeout(clickTimer.current);
    closeHover();
    onOpenDetails(quest.id);
  }, [closeHover, onOpenDetails, quest.id]);

  // Native listener: the double-click must not reach React Flow's pane, which would zoom in.
  useEffect(() => {
    const element = hoverRef.current;
    if (!element) return;
    const onDoubleClick = (event: MouseEvent) => {
      event.stopPropagation();
      openDetails();
    };
    element.addEventListener('dblclick', onDoubleClick);
    return () => element.removeEventListener('dblclick', onDoubleClick);
  }, [hoverRef, openDetails]);

  useEffect(() => () => window.clearTimeout(clickTimer.current), []);

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!isInteractive || event.detail > 1) return;
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => onToggle(quest.id), DOUBLE_CLICK_MS);
  };

  const summary = status === 'active' ? stepSummary(quest, doneLeafKeys(quest, objectiveProgress, false)) : null;
  const nodeClass = [
    'quest-node',
    `quest-node--${status}`,
    isInteractive ? '' : 'read-only',
    isHighlighted ? 'highlighted' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={nodeClass}
      onClick={handleClick}
      ref={hoverRef}
      aria-disabled={!isInteractive}
    >
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
          <XpValue xp={quest.xp} />
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} id="source-bottom" />
      <Handle type="source" position={Position.Left} id="source-left" />
      <Handle type="source" position={Position.Right} id="source-right" />
      <QuestHoverCard
        quest={quest}
        status={status}
        position={hoverPosition}
        visible={isHovered}
        objectiveProgress={objectiveProgress}
        onOpenDetails={openDetails}
        onMouseEnter={handlers.onMouseEnter}
        onMouseLeave={handlers.onMouseLeave}
        onContextMenu={handlers.onContextMenu}
      />
    </div>
  );
}
