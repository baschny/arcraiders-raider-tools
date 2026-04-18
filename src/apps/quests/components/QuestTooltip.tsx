import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import type { Quest, QuestItemEntry } from '../types/quest';
import { useLocale } from '../../../shared/context/LocaleContext';
import { getLocalizedTraderName } from '../utils/localization';
import { getQuestMapIndicator } from '../utils/mapMeta';

interface QuestTooltipProps {
  quest: Quest;
  position: { x: number; y: number; maxHeight: number };
  visible: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onContextMenu?: () => void;
}

function rarityClass(rarity: QuestItemEntry['rarity']): string {
  return `rarity-${rarity.toLowerCase()}`;
}

function QuestItemTile({ item }: { item: QuestItemEntry }) {
  return (
    <div className={`quest-item-tile ${rarityClass(item.rarity)}`} title={item.name}>
      <div className="quest-item-tile__container">
        {item.imageFilename ? (
          <img
            className="quest-item-tile__image"
            src={item.imageFilename}
            alt={item.name}
            loading="lazy"
          />
        ) : (
          <div className="quest-item-tile__placeholder" aria-hidden="true" />
        )}
        {item.quantity > 1 && (
          <span className="quest-item-tile__quantity">×{item.quantity}</span>
        )}
      </div>
      <span className="quest-item-tile__name">{item.name}</span>
    </div>
  );
}

export function QuestTooltip({
  quest,
  position,
  visible,
  onMouseEnter,
  onMouseLeave,
  onContextMenu,
}: QuestTooltipProps) {
  const { locale, t } = useLocale();
  if (!visible) return null;

  const mapIndicator = getQuestMapIndicator(quest.map, locale);
  const traderLabel = getLocalizedTraderName(quest.trader, locale);
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
  const hasObjectives = quest.objectives.length > 0;
  const hasOtherRequirements = quest.otherRequirements.length > 0;
  const hasRequiredItems = quest.requiredItems.length > 0;
  const hasGrantedItems = quest.grantedItems.length > 0;
  const hasRewardItems = quest.rewardItems.length > 0;
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
              {quest.objectives.map((objective, index) => (
                <li key={`${objective}-${index}`}>{objective}</li>
              ))}
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
                  <QuestItemTile key={item.id} item={item} />
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
                <QuestItemTile key={item.id} item={item} />
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
                <QuestItemTile key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
