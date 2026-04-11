import { createPortal } from 'react-dom';
import { Backpack, Coins, MapPin, PackageSearch, Recycle, Target, Weight, Wrench } from 'lucide-react';
import type { ItemsMap, PlannerItem } from '../types/item';
import type { PlannerResult } from '../types/planner';
import { getEmptyItemInsight, type ItemInsightsMap } from '../utils/itemInsights';
import { getLocationIcon } from '../utils/locationIcons';
import {
  getLocalizedQuartermasterLocation,
  getLocalizedQuartermasterRarity,
  getLocalizedQuartermasterType,
} from '../utils/localization';
import { useLocale } from '../../../shared/context/LocaleContext';

interface ItemTooltipProps {
  item: PlannerItem;
  itemsMap: ItemsMap;
  plannerResult: PlannerResult;
  itemInsights: ItemInsightsMap;
  ownedQuantity: number | null;
  position: { x: number; y: number; maxHeight: number };
  visible: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onContextMenu?: () => void;
}

function getRarityClass(rarity: PlannerItem['rarity']): string {
  return `rarity-${rarity.toLowerCase()}`;
}

function renderCompleteBadge(isComplete: boolean, t: (key: string) => string) {
  return (
    <span className={`qm-item-tooltip__status-badge ${isComplete ? 'qm-item-tooltip__status-badge--complete' : 'qm-item-tooltip__status-badge--missing'}`}>
      {isComplete ? t('quartermaster.itemTooltip.complete') : t('quartermaster.itemTooltip.needed')}
    </span>
  );
}

export function ItemTooltip({
  item,
  itemsMap,
  plannerResult,
  itemInsights,
  ownedQuantity,
  position,
  visible,
  onMouseEnter,
  onMouseLeave,
  onContextMenu,
}: ItemTooltipProps) {
  const { t } = useLocale();
  if (!visible) return null;

  const insight = getEmptyItemInsight(itemInsights, item.id);
  const hasRecipe = !!item.recipe && Object.keys(item.recipe).length > 0;
  const hasRecycles = !!item.recyclesInto && Object.keys(item.recyclesInto).length > 0;
  const hasSalvages = !!item.salvagesInto && Object.keys(item.salvagesInto).length > 0;
  const hasLocations = !!item.foundIn && item.foundIn.length > 0;
  const activeRecycleSalvageNeeds = insight.recycleSalvageNeeds.filter((need) => !need.isComplete);
  const ownedQuantityLabel = ownedQuantity === null ? '?' : ownedQuantity;

  const missingByItemId = new Map(plannerResult.planRows.map((row) => [row.itemId, row.missing]));

  return createPortal(
    <div
      className="qm-item-tooltip"
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
      <div className="qm-item-tooltip__header">
        <img
          src={item.icon}
          alt={item.name}
          className={`qm-item-tooltip__icon ${getRarityClass(item.rarity)}`}
        />
        <div className="qm-item-tooltip__have-pill">
          <Backpack size={13} />
          <span className={`qm-item-tooltip__have-pill-value ${ownedQuantity === null ? 'qm-item-tooltip__have-pill-value--unknown' : ''}`}>
            {ownedQuantityLabel}
          </span>
        </div>
        <div className="qm-item-tooltip__title">
          <h3 className="qm-item-name">{item.name}</h3>
          <div className="qm-item-tooltip__badges">
            <span className="qm-item-tooltip__badge qm-item-tooltip__badge--type">{getLocalizedQuartermasterType(t, item.type)}</span>
            <span className={`qm-item-tooltip__badge qm-item-tooltip__badge--rarity ${getRarityClass(item.rarity)}`}>
              {getLocalizedQuartermasterRarity(t, item.rarity)}
            </span>
          </div>
        </div>
      </div>

      {item.description && (
        <div className="qm-item-tooltip__description">{item.description}</div>
      )}

      <div className="qm-item-tooltip__stats">
        <div className="qm-item-tooltip__stat">
          <PackageSearch size={15} />
          <span className="qm-item-tooltip__stat-label">{t('quartermaster.itemTooltip.stackSize')}</span>
          <span className="qm-item-tooltip__stat-value">{item.stackSize}</span>
        </div>
        {item.weight !== undefined && (
          <div className="qm-item-tooltip__stat">
            <Weight size={15} />
            <span className="qm-item-tooltip__stat-label">{t('quartermaster.itemTooltip.weight')}</span>
            <span className="qm-item-tooltip__stat-value">{item.weight} kg</span>
          </div>
        )}
        {item.value !== undefined && (
          <div className="qm-item-tooltip__stat">
            <Coins size={15} />
            <span className="qm-item-tooltip__stat-label">{t('quartermaster.itemTooltip.value')}</span>
            <span className="qm-item-tooltip__stat-value">{item.value} Coins</span>
          </div>
        )}
        {hasLocations && (
          <div className="qm-item-tooltip__stat">
            <MapPin size={15} />
            <span className="qm-item-tooltip__stat-label">{t('quartermaster.itemTooltip.foundIn')}</span>
            <span className="qm-item-tooltip__stat-value qm-item-tooltip__stat-value--locations">
              {item.foundIn!.map((location) => {
                const locationIcon = getLocationIcon(location);
                const localizedLocation = getLocalizedQuartermasterLocation(t, location);
                return (
                  <span className="qm-item-tooltip__location" key={location}>
                    {locationIcon && (
                      <img
                        src={locationIcon}
                        alt={localizedLocation}
                        className="qm-item-tooltip__location-icon"
                      />
                    )}
                    {localizedLocation}
                  </span>
                );
              })}
            </span>
          </div>
        )}
      </div>

      {insight.finalListNeeds.length > 0 && (
        <div className="qm-item-tooltip__section">
          <h4>{t('quartermaster.itemTooltip.neededForLists')}</h4>
          <div className="qm-item-tooltip__status-list">
            {insight.finalListNeeds.map((need) => (
              <div className="qm-item-tooltip__status-item" key={`${need.listId}-${need.quantity}`}>
                <div className="qm-item-tooltip__status-main">
                  <span>{need.quantity}×</span>
                  <span>{need.listName}</span>
                </div>
                {renderCompleteBadge(need.isComplete, t)}
              </div>
            ))}
          </div>
        </div>
      )}

      {insight.craftingNeeds.length > 0 && (
        <div className="qm-item-tooltip__section">
          <h4>{t('quartermaster.itemTooltip.neededForCrafting')}</h4>
          <div className="qm-item-tooltip__status-list">
            {insight.craftingNeeds.map((need, index) => (
              <div className="qm-item-tooltip__status-item qm-item-tooltip__status-item--multiline" key={`${need.listId}-${need.targetItemId}-${index}`}>
                <div className="qm-item-tooltip__status-main">
                  <span>{need.listName}</span>
                  <span className="qm-item-name">{need.targetItemName}</span>
                </div>
                <div className="qm-item-tooltip__status-sub">{need.chainLabel}</div>
                {renderCompleteBadge(need.isComplete, t)}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeRecycleSalvageNeeds.length > 0 && (
        <div className="qm-item-tooltip__section">
          <h4>{t('quartermaster.itemTooltip.neededViaRecycleSalvage')}</h4>
          <div className="qm-item-tooltip__status-list">
            {activeRecycleSalvageNeeds.map((need, index) => (
              <div className="qm-item-tooltip__status-item" key={`${need.mode}-${need.producedItemId}-${need.listId}-${index}`}>
                <div className="qm-item-tooltip__status-main qm-item-tooltip__status-main--single-row">
                  <span className={`qm-item-tooltip__mode-badge qm-item-tooltip__mode-badge--${need.mode}`}>
                    {need.mode === 'recycle' ? t('quartermaster.itemTooltip.recycle') : t('quartermaster.itemTooltip.salvage')}
                  </span>
                  <span>{need.listName}</span>
                  <span className="qm-item-tooltip__status-arrow">→</span>
                  <span className="qm-item-tooltip__status-chain qm-item-name">{need.chainLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasRecipe && (
        <div className="qm-item-tooltip__section">
          <h4>{t('quartermaster.itemTooltip.craftingRecipe')}</h4>
          <div className="qm-item-tooltip__materials">
            {Object.entries(item.recipe!).map(([materialId, quantity]) => {
              const material = itemsMap[materialId];
              if (!material) return null;
              const isNeeded = (missingByItemId.get(materialId) ?? 0) > 0;
              return (
                <div className={`qm-item-tooltip__material ${isNeeded ? 'qm-item-tooltip__material--needed' : ''}`} key={materialId}>
                  <div className="qm-item-tooltip__material-main">
                    <img src={material.icon} alt={material.name} className={`qm-item-tooltip__material-icon ${getRarityClass(material.rarity)}`} />
                    <span className="qm-item-name">{material.name}</span>
                    {isNeeded && (
                      <span className="qm-item-tooltip__needed-flag">
                        <Target size={12} />
                      </span>
                    )}
                  </div>
                  <span className="qm-item-tooltip__material-quantity">×{quantity}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasRecycles && (
        <div className="qm-item-tooltip__section">
          <h4>
            <Recycle size={14} />
            {t('quartermaster.itemTooltip.recyclesInto')}
          </h4>
          <div className="qm-item-tooltip__materials">
            {Object.entries(item.recyclesInto!).map(([materialId, quantity]) => {
              const material = itemsMap[materialId];
              if (!material) return null;
              const isNeeded = insight.neededRecycleYieldIds.includes(materialId);
              return (
                <div className={`qm-item-tooltip__material ${isNeeded ? 'qm-item-tooltip__material--needed' : ''}`} key={materialId}>
                  <div className="qm-item-tooltip__material-main">
                    <img src={material.icon} alt={material.name} className={`qm-item-tooltip__material-icon ${getRarityClass(material.rarity)}`} />
                    <span className="qm-item-name">{material.name}</span>
                    {isNeeded && (
                      <span className="qm-item-tooltip__needed-flag">
                        <Target size={12} />
                      </span>
                    )}
                  </div>
                  <span className="qm-item-tooltip__material-quantity">×{quantity}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasSalvages && (
        <div className="qm-item-tooltip__section">
          <h4>
            <Wrench size={14} />
            {t('quartermaster.itemTooltip.salvagesInto')}
          </h4>
          <div className="qm-item-tooltip__materials">
            {Object.entries(item.salvagesInto!).map(([materialId, quantity]) => {
              const material = itemsMap[materialId];
              if (!material) return null;
              const isNeeded = insight.neededSalvageYieldIds.includes(materialId);
              return (
                <div className={`qm-item-tooltip__material ${isNeeded ? 'qm-item-tooltip__material--needed' : ''}`} key={materialId}>
                  <div className="qm-item-tooltip__material-main">
                    <img src={material.icon} alt={material.name} className={`qm-item-tooltip__material-icon ${getRarityClass(material.rarity)}`} />
                    <span className="qm-item-name">{material.name}</span>
                    {isNeeded && (
                      <span className="qm-item-tooltip__needed-flag">
                        <Target size={12} />
                      </span>
                    )}
                  </div>
                  <span className="qm-item-tooltip__material-quantity">×{quantity}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
