import { createPortal } from 'react-dom';
import { Backpack, CircleCheck, CircleX, Coins, Home, List, MapPin, PackageSearch, Recycle, Target, Weight, Wrench, Shield } from 'lucide-react';
import type { ItemsMap, PlannerItem } from '../types/item';
import type { ListType, PlannerResult } from '../types/planner';
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

function getRarityClass(rarity: string): string {
  return `rarity-${rarity.toLowerCase()}`;
}

function getListIcon(listType: ListType) {
  const Icon = listType === 'hideout' ? Home : List;
  return <Icon size={14} />;
}

function renderCompleteBadge(isComplete: boolean, t: (key: string) => string) {
  return (
    <span className={`qm-item-tooltip__status-badge ${isComplete ? 'qm-item-tooltip__status-badge--complete' : 'qm-item-tooltip__status-badge--missing'}`}>
      {isComplete ? t('quartermaster.itemTooltip.complete') : t('quartermaster.itemTooltip.needed')}
    </span>
  );
}

function renderNeededBadge(missing: number, t: (key: string) => string) {
  if (missing <= 0) {
    return <span className="qm-item-tooltip__needed-badge qm-item-tooltip__needed-badge--complete">{t('quartermaster.itemTooltip.complete')}</span>;
  }
  return <span className="qm-item-tooltip__needed-badge qm-item-tooltip__needed-badge--missing">{missing} {t('quartermaster.itemTooltip.needed')}</span>;
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
  const ownedQuantityLabel = ownedQuantity === null ? '?' : ownedQuantity;

  const missingByItemId = new Map(plannerResult.planRows.map((row) => [row.itemId, row.missing]));
  const craftability = plannerResult.craftability?.[item.id];

  return createPortal(
    <div
      className={`qm-item-tooltip ${(insight.finalListNeeds.length > 0 || insight.craftingNeeds.length > 0 || insight.recycleSalvageUsages.length > 0 || insight.repairNeeds.length > 0) ? 'qm-item-tooltip--two-col' : ''}`}
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

      <div className={`qm-item-tooltip__body ${(insight.finalListNeeds.length > 0 || insight.craftingNeeds.length > 0 || insight.recycleSalvageUsages.length > 0 || insight.repairNeeds.length > 0) ? 'qm-item-tooltip__body--two-col' : ''}`}>
        <div className="qm-item-tooltip__col-left">
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

          {hasRecipe && (
            <div className="qm-item-tooltip__section">
              <h4>{t('quartermaster.itemTooltip.craftingRecipe')}</h4>

              {craftability && (craftability.bench || craftability.blueprint) && (
                <div className="qm-item-tooltip__craft-conditions">
                  {craftability.bench && (
                    <div className={`qm-item-tooltip__craft-condition ${craftability.bench.satisfied ? 'qm-item-tooltip__craft-condition--met' : 'qm-item-tooltip__craft-condition--unmet'}`}>
                      {craftability.bench.satisfied
                        ? <CircleCheck size={14} />
                        : <CircleX size={14} />
                      }
                      <span className="qm-item-tooltip__craft-condition-label">{craftability.bench.label}</span>
                      <span className="qm-item-tooltip__craft-condition-detail">{craftability.bench.detail}</span>
                    </div>
                  )}
                  {craftability.blueprint && (
                    <div className={`qm-item-tooltip__craft-condition ${craftability.blueprint.satisfied ? 'qm-item-tooltip__craft-condition--met' : 'qm-item-tooltip__craft-condition--unmet'}`}>
                      {craftability.blueprint.satisfied
                        ? <CircleCheck size={14} />
                        : <CircleX size={14} />
                      }
                      <span className="qm-item-tooltip__craft-condition-label">{craftability.blueprint.label}</span>
                      <span className="qm-item-tooltip__craft-condition-detail">{craftability.blueprint.detail}</span>
                    </div>
                  )}
                </div>
              )}

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
                  return (
                    <div className="qm-item-tooltip__material" key={materialId}>
                      <div className="qm-item-tooltip__material-main">
                        <img src={material.icon} alt={material.name} className={`qm-item-tooltip__material-icon ${getRarityClass(material.rarity)}`} />
                        <span className="qm-item-name">{material.name}</span>
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
                  return (
                    <div className="qm-item-tooltip__material" key={materialId}>
                      <div className="qm-item-tooltip__material-main">
                        <img src={material.icon} alt={material.name} className={`qm-item-tooltip__material-icon ${getRarityClass(material.rarity)}`} />
                        <span className="qm-item-name">{material.name}</span>
                      </div>
                      <span className="qm-item-tooltip__material-quantity">×{quantity}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {(insight.finalListNeeds.length > 0 || insight.craftingNeeds.length > 0 || insight.repairNeeds.length > 0 || insight.recycleSalvageUsages.length > 0) && (
          <div className="qm-item-tooltip__col-right">
            {insight.finalListNeeds.length > 0 && (
              <div className="qm-item-tooltip__section">
                <h4>{t('quartermaster.itemTooltip.neededForLists')}</h4>
                <div className="qm-item-tooltip__needs-grid">
                  {insight.finalListNeeds.map((need) => (
                    <div className="qm-item-tooltip__needs-row" key={`${need.listId}-${need.quantity}`}>
                      <div className="qm-item-tooltip__needs-left">
                        {getListIcon(need.listType)}
                        <span className="qm-item-tooltip__needs-name">{need.listName}</span>
                      </div>
                      <div className="qm-item-tooltip__needs-right">
                        <span className="qm-item-tooltip__needs-quantity">{need.quantity}×</span>
                        {renderNeededBadge(need.missing, t)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {insight.craftingNeeds.length > 0 && (
              <div className="qm-item-tooltip__section">
                <h4>{t('quartermaster.itemTooltip.neededForCrafting')}</h4>
                <div className="qm-item-tooltip__needs-grid">
                  {insight.craftingNeeds.map((need, index) => {
                    const targetItem = itemsMap[need.targetItemId];
                    const targetIcon = targetItem?.icon ?? '';
                    return (
                      <div className="qm-item-tooltip__needs-row" key={`${need.listId}-${need.targetItemId}-${index}`}>
                        <div className="qm-item-tooltip__needs-left">
                          {getListIcon(need.listType)}
                          <img
                            src={targetIcon}
                            alt={need.targetItemName}
                            className={`qm-item-tooltip__needs-icon ${getRarityClass(need.targetItemRarity)}`}
                          />
                          <span className="qm-item-tooltip__needs-name">{need.targetItemName}</span>
                        </div>
                        <div className="qm-item-tooltip__needs-right">
                          {renderCompleteBadge(need.isComplete, t)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {insight.repairNeeds.length > 0 && (
              <div className="qm-item-tooltip__section">
                <h4>
                  <Shield size={14} />
                  {t('quartermaster.itemTooltip.neededForRepair')}
                </h4>
                <div className="qm-item-tooltip__needs-grid">
                  {insight.repairNeeds.map((need, index) => {
                    const targetItem = itemsMap[need.targetItemId];
                    const targetIcon = targetItem?.icon ?? '';
                    return (
                      <div className="qm-item-tooltip__needs-row" key={`repair-${need.targetItemId}-${need.listId}-${index}`}>
                        <div className="qm-item-tooltip__needs-left">
                          {getListIcon(need.listType)}
                          <img
                            src={targetIcon}
                            alt={need.targetItemName}
                            className={`qm-item-tooltip__needs-icon ${getRarityClass(targetItem?.rarity?.toLowerCase() ?? 'common')}`}
                          />
                          <span className="qm-item-tooltip__needs-name">
                            {need.targetItemName}
                          </span>
                        </div>
                        <div className="qm-item-tooltip__needs-right">
                          <span className="qm-item-tooltip__needs-quantity">{need.quantity}×</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {insight.recycleSalvageUsages.length > 0 && (
              <div className="qm-item-tooltip__section">
                <h4>{t('quartermaster.itemTooltip.couldBeUsedFor')}</h4>
                <div className="qm-item-tooltip__needs-grid">
                  {insight.recycleSalvageUsages.map((usage, index) => {
                    const targetItem = itemsMap[usage.targetItemId];
                    const targetIcon = targetItem?.icon ?? '';
                    const yieldItem = itemsMap[usage.yieldItemId];
                    const yieldIcon = yieldItem?.icon ?? '';
                    return (
                      <div className="qm-item-tooltip__needs-row" key={`${usage.listId}-${usage.targetItemId}-${usage.yieldItemId}-${index}`}>
                        <div className="qm-item-tooltip__needs-left">
                          {getListIcon(usage.listType)}
                          <img
                            src={yieldIcon}
                            alt={usage.yieldItemName}
                            className={`qm-item-tooltip__needs-icon ${getRarityClass('common')}`}
                          />
                          <span className="qm-item-tooltip__needs-name">
                            <span className="qm-item-tooltip__status-arrow">x{usage.yieldQuantity} → </span>
                            <img
                              src={targetIcon}
                              alt={usage.targetItemName}
                              className={`qm-item-tooltip__needs-icon ${getRarityClass(usage.targetItemRarity)}`}
                            />
                            <span className="qm-item-name">{usage.targetItemName}</span>
                          </span>
                        </div>
                        <div className="qm-item-tooltip__needs-right">
                          {renderCompleteBadge(usage.isComplete, t)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
