import { createPortal } from 'react-dom';
import { Backpack, BriefcaseBusiness, CircleCheck, CircleX, Coins, Home, List, MapPin, PackageSearch, Recycle, ScrollText, Target, Weight, Wrench, Shield } from 'lucide-react';
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
import { ItemIcon as SharedItemIcon } from '../../../shared/components/ItemIcon';
import { getRarityClass } from '../../../shared/utils/rarity';

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

function parseProjectId(listId: string): string | null {
  const match = listId.match(/^project_(.+)_\d+$/);
  return match ? match[1] : null;
}

function formatProjectName(projectId: string): string {
  return projectId
    .replace(/_project|_s\d+$|_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function getListIcon(listType: ListType) {
  if (listType === 'hideout') return <Home size={14} />;
  if (listType === 'project') return <BriefcaseBusiness size={14} />;
  if (listType === 'quest') return <ScrollText size={14} />;
  return <List size={14} />;
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

function computeWeaponCumulativeRecipe(item: PlannerItem, itemsMap: ItemsMap): Record<string, number> | null {
  if (!item.weaponTier || item.weaponTier <= 1 || !item.weaponBaseId) return null;

  const cumulative: Record<string, number> = {};

  const rootItem = itemsMap[item.weaponBaseId];
  if (rootItem?.recipe) {
    for (const [matId, qty] of Object.entries(rootItem.recipe)) {
      cumulative[matId] = (cumulative[matId] ?? 0) + qty;
    }
  }

  let currentId: string = item.weaponBaseId;
  while (currentId !== item.id) {
    const nextId = itemsMap[currentId]?.upgradesTo;
    if (!nextId || !itemsMap[nextId]) break;
    const upgradeCost = itemsMap[nextId]?.upgradeCost;
    if (upgradeCost) {
      for (const [matId, qty] of Object.entries(upgradeCost)) {
        cumulative[matId] = (cumulative[matId] ?? 0) + qty;
      }
    }
    currentId = nextId;
    if (currentId === item.id) break;
  }

  return Object.keys(cumulative).length > 0 ? cumulative : null;
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
  const cumulativeWeaponRecipe = computeWeaponCumulativeRecipe(item, itemsMap);
  const displayRecipe = hasRecipe ? item.recipe! : cumulativeWeaponRecipe;
  const hasDisplayRecipe = !!displayRecipe && Object.keys(displayRecipe).length > 0;
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
        <SharedItemIcon itemId={item.id} name={item.name} icon={item.icon} rarity={item.rarity} showName={false} className="qm-item-tooltip__icon" />
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

          {hasDisplayRecipe && (
            <div className="qm-item-tooltip__section">
              <h4>{cumulativeWeaponRecipe
                ? t('quartermaster.itemTooltip.craftingRecipeIncludingUpgrades')
                : t('quartermaster.itemTooltip.craftingRecipe')}</h4>

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
                {Object.entries(displayRecipe!).map(([materialId, quantity]) => {
                  const material = itemsMap[materialId];
                  if (!material) return null;
                  const isNeeded = (missingByItemId.get(materialId) ?? 0) > 0;
                  return (
                    <div className={`qm-item-tooltip__material ${isNeeded ? 'qm-item-tooltip__material--needed' : ''}`} key={materialId}>
                      <div className="qm-item-tooltip__material-main">
                        <SharedItemIcon itemId={materialId} name={material.name} icon={material.icon} rarity={material.rarity} showName={false} className="qm-item-tooltip__material-icon" />
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
                        <SharedItemIcon itemId={materialId} name={material.name} icon={material.icon} rarity={material.rarity} showName={false} className="qm-item-tooltip__material-icon" />
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
                        <SharedItemIcon itemId={materialId} name={material.name} icon={material.icon} rarity={material.rarity} showName={false} className="qm-item-tooltip__material-icon" />
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
            {(() => {
              const questNeeds = insight.finalListNeeds.filter((n) => n.listType === 'quest');
              const genericNeeds = insight.finalListNeeds.filter((n) => n.listType !== 'project' && n.listType !== 'quest');
              const projectNeeds = insight.finalListNeeds.filter((n) => n.listType === 'project');
              const projectGroups = new Map<string, typeof projectNeeds>();
              for (const need of projectNeeds) {
                const pid = parseProjectId(need.listId);
                if (!pid) continue;
                const name = formatProjectName(pid);
                if (!projectGroups.has(name)) projectGroups.set(name, []);
                projectGroups.get(name)!.push(need);
              }

              return (
                <>
                  {questNeeds.length > 0 && (
                    <div className="qm-item-tooltip__section">
                      <h4>{t('quartermaster.itemTooltip.neededForQuests')}</h4>
                      <div className="qm-item-tooltip__needs-grid">
                        {questNeeds.map((need) => (
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
                  {genericNeeds.length > 0 && (
                    <div className="qm-item-tooltip__section">
                      <h4>{t('quartermaster.itemTooltip.neededForLists')}</h4>
                      <div className="qm-item-tooltip__needs-grid">
                        {genericNeeds.map((need) => (
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
                  {[...projectGroups.entries()].map(([projectName, needs]) => (
                    <div className="qm-item-tooltip__section" key={projectName}>
                      <h4>{t('quartermaster.itemTooltip.neededForProject').replace('{project}', projectName)}</h4>
                      <div className="qm-item-tooltip__needs-grid">
                        {needs.map((need) => (
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
                  ))}
                </>
              );
            })()}

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
                          <SharedItemIcon itemId={need.targetItemId} name={need.targetItemName} icon={targetIcon || undefined} rarity={need.targetItemRarity} showName={false} className="qm-item-tooltip__needs-icon" />
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
                          <SharedItemIcon itemId={need.targetItemId} name={need.targetItemName} icon={targetIcon || undefined} rarity={targetItem?.rarity} showName={false} className="qm-item-tooltip__needs-icon" />
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
                          <SharedItemIcon itemId={usage.yieldItemId} name={usage.yieldItemName} icon={yieldIcon || undefined} rarity="Common" showName={false} className="qm-item-tooltip__needs-icon" />
                          <span className="qm-item-tooltip__needs-name">
                            <span className="qm-item-tooltip__status-arrow">x{usage.yieldQuantity} → </span>
                            <SharedItemIcon itemId={usage.targetItemId} name={usage.targetItemName} icon={targetIcon || undefined} rarity={usage.targetItemRarity} showName={false} className="qm-item-tooltip__needs-icon" />
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
