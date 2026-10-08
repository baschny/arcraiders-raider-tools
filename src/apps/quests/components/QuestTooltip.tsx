import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';
import type { Quest, ObjectiveView } from '../types/quest';
import { useLocale } from '../../../shared/context/LocaleContext';
import { getQuestMapIndicator } from '../utils/mapMeta';
import { questLabel } from '../utils/labels';
import type { LinkedQuestObjectiveProgress } from '../../../shared/types/linkedQuests';
import { ItemIcon } from '../../../shared/components/ItemIcon';

interface QuestTooltipProps {
  quest: Quest;
  position: { x: number; y: number; maxHeight: number };
  visible: boolean;
  objectiveProgress?: LinkedQuestObjectiveProgress[];
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onContextMenu?: () => void;
}

export function QuestTooltip({
  quest,
  position,
  visible,
  objectiveProgress,
  onMouseEnter,
  onMouseLeave,
  onContextMenu,
}: QuestTooltipProps) {
  const { locale, t } = useLocale();
  if (!visible) return null;

  const mapIndicator = getQuestMapIndicator(quest.map, locale);
  const traderLabel = quest.trader;
  const locationLabel = mapIndicator ? mapIndicator.names.join(', ') : '';

  const headerStyle = mapIndicator
    ? ({
        '--map-accent': mapIndicator.accentColor,
        ...(mapIndicator.backgroundImage
          ? { backgroundImage: `url(${mapIndicator.backgroundImage})` }
          : {}),
      } as CSSProperties)
    : undefined;

  const hasDescription = quest.description.trim().length > 0;
  const hasObjectives = !!quest.objectiveTree && (quest.objectiveTree.children.length > 0 || quest.objectives.length > 0);
  const hasOtherRequirements = quest.otherRequirements.length > 0;
  const hasRequiredItems = quest.requiredItems.length > 0;
  const hasGrantedItems = quest.grantedItems.length > 0;
  const hasRewardItems = quest.rewardItems.length > 0;
  const hasOptionalRewards = quest.optionalRewardItems.length > 0;
  const hasRequirements = hasOtherRequirements || hasRequiredItems;

  const headerClassName = [
    'quest-tooltip__header',
    mapIndicator ? '' : 'quest-tooltip__header--no-map',
    mapIndicator?.isMultiple ? 'quest-tooltip__header--multi-map' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div
      className="quest-tooltip"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        maxHeight: `${position.maxHeight}px`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onContextMenu={onContextMenu}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onMouseUp={(event) => event.stopPropagation()}
    >
      <div className={headerClassName} style={headerStyle}>
        <div className="quest-tooltip__header-content">
          <div className="quest-tooltip__title">{quest.name}</div>
          <div className="quest-tooltip__meta">
            <span className="quest-tooltip__meta-trader">{traderLabel}</span>
            {locationLabel && (
              <>
                <span className="quest-tooltip__meta-sep" aria-hidden="true">
                  •
                </span>
                <span className="quest-tooltip__meta-location">{locationLabel}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="quest-tooltip__body">
        {hasDescription && (
          <div className="quest-tooltip__description">{quest.description}</div>
        )}

        {hasObjectives && (
          <div className="quest-tooltip__section">
            <h4 className="quest-tooltip__section-title">
              {t('quests.tooltipObjectives')}
              {quest.objectivesOneRound && (
                <span className="quest-tooltip__badge quest-tooltip__badge--one-round">
                  {t('quests.tooltipObjectivesOneRound')}
                </span>
              )}
            </h4>
            <ul className="quest-tooltip__objectives">
              {renderObjective(quest.objectiveTree!, objectiveProgress, locale, t('quests.objectiveDone'), true)}
            </ul>
          </div>
        )}

        {hasRequirements && (
          <div className="quest-tooltip__section">
            <h4 className="quest-tooltip__section-title">
              {t('quests.tooltipRequirements')}
            </h4>
            {hasOtherRequirements && (
              <ul className="quest-tooltip__requirements">
                {quest.otherRequirements.map((requirement, index) => (
                  <li key={`${requirement}-${index}`}>{requirement}</li>
                ))}
              </ul>
            )}
            {hasRequiredItems && (
              <div className="quest-tooltip__tiles">
                {quest.requiredItems.map((item) => (
                  <ItemIcon
                    key={item.id}
                    itemId={item.id}
                    name={item.name}
                    icon={item.imageFilename}
                    rarity={item.rarity}
                    showName={true}
                    showQuantity={item.quantity > 1}
                    quantity={item.quantity}
                    style={{ '--item-icon-size': '64px' } as React.CSSProperties}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {hasGrantedItems && (
          <div className="quest-tooltip__section">
            <h4 className="quest-tooltip__section-title">
              {t('quests.tooltipGranted')}
            </h4>
            <div className="quest-tooltip__tiles">
              {quest.grantedItems.map((item) => (
                <ItemIcon
                  key={item.id}
                  itemId={item.id}
                  name={item.name}
                  icon={item.imageFilename}
                  rarity={item.rarity}
                  showName={true}
                  showQuantity={item.quantity > 1}
                  quantity={item.quantity}
                  style={{ '--item-icon-size': '64px' } as React.CSSProperties}
                />
              ))}
            </div>
          </div>
        )}

        {hasRewardItems && (
          <div className="quest-tooltip__section">
            <h4 className="quest-tooltip__section-title">
              {t('quests.tooltipRewards')}
            </h4>
            <div className="quest-tooltip__tiles">
              {quest.rewardItems.map((item) => (
                <ItemIcon
                  key={item.id}
                  itemId={item.id}
                  name={item.name}
                  icon={item.imageFilename}
                  rarity={item.rarity}
                  showName={true}
                  showQuantity={item.quantity > 1}
                  quantity={item.quantity}
                  style={{ '--item-icon-size': '64px' } as React.CSSProperties}
                />
              ))}
            </div>
          </div>
        )}

        {hasOptionalRewards && (
          <div className="quest-tooltip__section">
            <h4 className="quest-tooltip__section-title">
              {questLabel('optional', locale)} {t('quests.tooltipRewards')}
            </h4>
            <div className="quest-tooltip__tiles">
              {quest.optionalRewardItems.map((item) => (
                <ItemIcon
                  key={item.id}
                  itemId={item.id}
                  name={item.name}
                  icon={item.imageFilename}
                  rarity={item.rarity}
                  showName={true}
                  showQuantity={item.quantity > 1}
                  quantity={item.quantity}
                  style={{ '--item-icon-size': '64px' } as React.CSSProperties}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function formatObjectiveProgress(
  progress: LinkedQuestObjectiveProgress,
  doneLabel: string,
): string {
  if (progress.completed) return doneLabel;
  if (
    typeof progress.currentAmount === 'number' &&
    typeof progress.requiredAmount === 'number' &&
    progress.requiredAmount > 1
  ) {
    return `${progress.currentAmount}/${progress.requiredAmount}`;
  }
  return '';
}

/**
 * Renders an objective node as list items. Plain groups (sequence/allOf without text or round
 * marker) are transparent and render only their children; choices and one-round groups get a
 * label and a nested list. Nodes without text skip their title but still render children.
 */
function renderObjective(
  node: ObjectiveView,
  progress: LinkedQuestObjectiveProgress[] | undefined,
  locale: Parameters<typeof questLabel>[1],
  doneLabel: string,
  isRoot = false,
): ReactNode {
  if (node.kind === 'atomic') {
    if (!node.text) return null;
    const entry = node.leafIndex !== undefined ? progress?.[node.leafIndex] : undefined;
    const progressLabel = entry ? formatObjectiveProgress(entry, doneLabel) : '';
    return (
      <li
        key={node.key}
        className={[entry?.completed ? 'is-completed' : '', node.optional ? 'is-optional' : '']
          .filter(Boolean)
          .join(' ') || undefined}
      >
        <span>{node.text}</span>
        {node.optional && (
          <span className="quest-tooltip__badge">{questLabel('optional', locale)}</span>
        )}
        {progressLabel && <span className="quest-tooltip__objective-progress">{progressLabel}</span>}
      </li>
    );
  }

  const choiceLabel =
    node.kind === 'anyOf' || node.kind === 'anyOfExclusive'
      ? questLabel('oneOf', locale)
      : node.kind === 'nOf'
        ? questLabel('nOf', locale, { count: node.requiredCount ?? 1 })
        : null;
  const children = node.children.map((child) =>
    renderObjective(child, progress, locale, doneLabel),
  );
  // The root's one-round marker is shown next to the section title.
  const showOneRound = node.oneRound && !isRoot;
  if (!choiceLabel && !showOneRound && !node.text) return <>{children}</>;

  return (
    <li key={node.key} className="quest-tooltip__group">
      {node.text && <span>{node.text}</span>}
      {choiceLabel && <span className="quest-tooltip__badge quest-tooltip__badge--choice">{choiceLabel}</span>}
      {showOneRound && (
        <span className="quest-tooltip__badge quest-tooltip__badge--one-round">
          {questLabel('oneRound', locale)}
        </span>
      )}
      {node.optional && <span className="quest-tooltip__badge">{questLabel('optional', locale)}</span>}
      <ul className="quest-tooltip__objectives quest-tooltip__objectives--nested">{children}</ul>
    </li>
  );
}
