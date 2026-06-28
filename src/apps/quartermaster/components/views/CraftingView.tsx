/**
 * Crafting View Component
 * See specification section 7.6
 */

import { AlertTriangle, BriefcaseBusiness, Hammer, Home, List, RefreshCw, ScrollText, Wrench } from 'lucide-react';
import type { ItemsMap, BenchId, PlannerItem } from '../../types/item';
import type { CraftPlan, ListType, PlannerResult, RecycleAction, RecyclePlan, WeaponUpgradePlan } from '../../types/planner';
import { BENCH_ORDER } from '../../types/item';
import { ItemIcon } from '../ItemIcon';
import type { ItemCraftingNeed, ItemFinalListNeed, ItemInsightsMap } from '../../utils/itemInsights';
import { getLocalizedBenchName } from '../../utils/localization';
import { useLocale } from '../../../../shared/context/LocaleContext';

interface CraftingViewProps {
  itemsMap: ItemsMap;
  craftPlan: CraftPlan;
  weaponUpgradePlan: WeaponUpgradePlan;
  recyclePlan: RecyclePlan;
  plannerResult: PlannerResult;
  itemInsights: ItemInsightsMap;
  getOwnedQuantity: (itemId: string) => number | null;
  onSyncMyItems: () => void;
  onSyncBlueprints: () => void;
  isSyncingMyItems: boolean;
  isSyncingBlueprints: boolean;
  blueprintsSyncedAt: string | null;
  blueprintUnlockCount: {
    unlocked: number;
    total: number;
  } | null;
  showSyncButtons?: boolean;
}

export function CraftingView({
  itemsMap,
  craftPlan,
  weaponUpgradePlan,
  recyclePlan,
  plannerResult,
  itemInsights,
  getOwnedQuantity,
  onSyncMyItems,
  onSyncBlueprints,
  isSyncingMyItems,
  isSyncingBlueprints,
  blueprintsSyncedAt,
  blueprintUnlockCount,
  showSyncButtons = true,
}: CraftingViewProps) {
  const { t, tm, formatDate } = useLocale();
  // Craft steps are executable actions, including partial progress toward a target.
  const satisfiableSteps = craftPlan.steps.filter(step => step.isFullySatisfiable);
  const tooltipContext = {
    itemsMap,
    plannerResult,
    itemInsights,
  };

  const getListIcon = (listType: ListType) => {
    if (listType === 'hideout') return <Home size={14} />;
    if (listType === 'project') return <BriefcaseBusiness size={14} />;
    if (listType === 'quest') return <ScrollText size={14} />;
    return <List size={14} />;
  };

  const renderTableItemIcon = (
    item: PlannerItem,
    options: { size?: 'xs' | 'table' | 'sm' | 'md' | 'lg' } = {},
  ) => (
    <ItemIcon
      itemId={item.id}
      name={item.name}
      icon={item.icon}
      rarity={item.rarity}
      quantity={getOwnedQuantity(item.id)}
      size={options.size ?? 'table'}
      showName={false}
      showQuantity={false}
      showPriorityAction={false}
      tooltipContext={tooltipContext}
    />
  );
  const formatTimestamp = (isoString: string): string => {
    try {
      return formatDate(new Date(isoString), { hour: '2-digit', minute: '2-digit' });
    } catch {
      return t('quartermaster.globalHeader.invalid');
    }
  };

  interface CraftingWhyEntry {
    key: string;
    listName: string;
    listType: ListType;
    quantity: number;
    missing: number;
    isComplete: boolean;
    targetItemId?: string;
    targetItemName?: string;
  }

  const getFinalListNeed = (targetItemId: string, listId: string): ItemFinalListNeed | null => {
    const targetInsight = itemInsights[targetItemId];
    return targetInsight?.finalListNeeds.find((source) => source.listId === listId) ?? null;
  };

  const getTargetListNeed = (need: ItemCraftingNeed): ItemFinalListNeed | null => {
    return getFinalListNeed(need.targetItemId, need.listId);
  };

  const getCraftWhyEntries = (itemId: string): CraftingWhyEntry[] => {
    const insight = itemInsights[itemId];
    if (!insight) return [];

    const entries = [
      ...insight.finalListNeeds.map((need) => ({
        key: `${need.listId}-${itemId}-final`,
        listName: need.listName,
        listType: need.listType,
        quantity: need.quantity,
        missing: need.missing,
        isComplete: need.isComplete,
      })),
      ...insight.craftingNeeds.map((need, index) => {
        const targetNeed = getTargetListNeed(need);
        return {
          key: `${need.listId}-${need.targetItemId}-${index}`,
          listName: need.listName,
          listType: need.listType,
          quantity: targetNeed?.quantity ?? 0,
          missing: targetNeed?.missing ?? (need.isComplete ? 0 : 1),
          targetItemId: need.targetItemId,
          targetItemName: need.targetItemName,
          isComplete: targetNeed?.isComplete ?? need.isComplete,
        };
      }),
    ];

    const dedupe = new Map(entries.map((entry) => [entry.key, entry]));
    return Array.from(dedupe.values());
  };

  const getRecycleWhyEntries = (action: RecycleAction): CraftingWhyEntry[] => {
    const entries = action.reasons.map((reason) => {
      const targetNeed = getFinalListNeed(reason.targetItemId, reason.listId);
      return {
        key: [
          reason.listId,
          reason.targetItemId,
          reason.producedItemId,
        ].join('|'),
        listName: reason.listName,
        listType: targetNeed?.listType ?? 'user',
        quantity: targetNeed?.quantity ?? reason.quantityCovered,
        missing: targetNeed?.missing ?? reason.quantityCovered,
        isComplete: targetNeed?.isComplete ?? false,
        targetItemId: reason.targetItemId,
        targetItemName: reason.targetItemName,
      };
    });

    const dedupe = new Map(entries.map((entry) => [entry.key, entry]));
    return Array.from(dedupe.values());
  };

  const renderWhyEntries = (entries: CraftingWhyEntry[], options: { showState?: boolean } = {}) => {
    const { showState = true } = options;
    if (entries.length === 0) {
      return <span className="crafting-view__why-empty">{t('quartermaster.crafting.noImpact')}</span>;
    }

    const groups = entries.reduce<Array<{ key: string; targetItem: PlannerItem | null; targetName: string | null; entries: CraftingWhyEntry[] }>>((acc, entry) => {
      const targetItem = entry.targetItemId ? itemsMap[entry.targetItemId] : null;
      const key = targetItem ? targetItem.id : `direct-${entry.key}`;
      const existing = acc.find((group) => group.key === key);
      if (existing) {
        existing.entries.push(entry);
        return acc;
      }

      acc.push({
        key,
        targetItem,
        targetName: targetItem ? entry.targetItemName ?? targetItem.name : null,
        entries: [entry],
      });
      return acc;
    }, []);

    return (
      <div className="crafting-view__why-list">
        {groups.map((group) => (
          <div key={group.key} className="crafting-view__why-group">
            {group.targetItem && (
              <div className="crafting-view__why-target">
                {renderTableItemIcon(group.targetItem)}
                <span className="qm-item-name">{group.targetName}</span>
              </div>
            )}
            {group.entries.map((entry) => (
              <div key={entry.key} className="crafting-view__why-item">
                <div className="crafting-view__why-copy">
                  <div className="crafting-view__why-main">
                    {getListIcon(entry.listType)}
                    <span>{entry.listName}</span>
                    <span className="crafting-view__why-quantity">{entry.quantity}x</span>
                  </div>
                </div>
                {showState && (
                  <span className={`crafting-view__why-state ${entry.isComplete ? 'crafting-view__why-state--complete' : 'crafting-view__why-state--needed'}`}>
                    {entry.isComplete ? t('quartermaster.itemTooltip.complete') : `${entry.missing} ${t('quartermaster.itemTooltip.needed')}`}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  const renderRecyclePriorityWarning = (action: RecycleAction) => {
    if (action.sourcePriorityGroup !== 'direct_recipe_input' || !action.sourcePriorityWarnings?.length) {
      return null;
    }

    const [warning] = action.sourcePriorityWarnings;
    const remainingCount = action.sourcePriorityWarnings.length - 1;

    return (
      <div className="crafting-view__why-warning">
        <AlertTriangle size={14} strokeWidth={2} />
        <span>
          {tm('quartermaster.crafting.directInputRecycleWarning', {
            listName: warning.listName,
            targetItemName: warning.targetItemName,
            count: remainingCount,
          })}
        </span>
      </div>
    );
  };

  const renderMaterialRows = (
    materials: Record<string, number>,
    options: {
      mode?: 'input' | 'yield';
      highlightedItemIds?: Set<string>;
    } = {},
  ) => (
    <div className="crafting-view__materials">
      {Object.entries(materials).map(([materialId, quantity]) => {
        const material = itemsMap[materialId];
        if (!material) return null;
        const ownedQuantity = getOwnedQuantity(material.id);
        const isHighlighted = options.highlightedItemIds?.has(materialId) ?? false;

        return (
          <div className={`crafting-view__material-row ${isHighlighted ? 'crafting-view__material-row--highlighted' : ''}`} key={materialId}>
            <div className="crafting-view__material-main">
              {renderTableItemIcon(material)}
              <span className="qm-item-name">{material.name}</span>
            </div>
            <span className="crafting-view__material-qty">
              {options.mode === 'input'
                ? tm('quartermaster.crafting.inputUseHave', {
                  use: quantity,
                  have: ownedQuantity === null ? '?' : ownedQuantity,
                })
                : `×${quantity}`}
            </span>
          </div>
        );
      })}
    </div>
  );

  const renderOutputQuantity = (totalOutput: number, craftTimes: number) => (
    <div className="crafting-view__output">
      <span className="crafting-view__output-total">{totalOutput}</span>
      {craftTimes !== totalOutput && totalOutput % craftTimes === 0 && (
        <span className="crafting-view__output-crafts">
          {tm('quartermaster.crafting.craftCount', { count: craftTimes })}
        </span>
      )}
    </div>
  );

  // Group craft steps by bench
  const stepsByBench = BENCH_ORDER.reduce((acc, benchId) => {
    acc[benchId] = satisfiableSteps.filter(step => step.benchId === benchId);
    return acc;
  }, {} as Record<BenchId, typeof craftPlan.steps>);
  const groupedRecycleActions = (() => {
    const grouped = new Map<string, RecycleAction>();

    for (const action of recyclePlan.actions) {
      const existing = grouped.get(action.srcItemId);
      if (!existing) {
        grouped.set(action.srcItemId, {
          ...action,
          yields: { ...action.yields },
          reasons: [...action.reasons],
          sourcePriorityWarnings: action.sourcePriorityWarnings
            ? [...action.sourcePriorityWarnings]
            : undefined,
        });
        continue;
      }

      existing.qtyToRecycle += action.qtyToRecycle;
      for (const [itemId, quantity] of Object.entries(action.yields)) {
        existing.yields[itemId] = (existing.yields[itemId] ?? 0) + quantity;
      }
      existing.reasons.push(...action.reasons);

      if (action.sourcePriorityWarnings?.length) {
        existing.sourcePriorityWarnings = [
          ...(existing.sourcePriorityWarnings ?? []),
          ...action.sourcePriorityWarnings,
        ];
      }
    }

    for (const action of grouped.values()) {
      action.reasons = Array.from(new Map(action.reasons.map((reason) => [
        [
          reason.listId,
          reason.targetItemId,
          reason.producedItemId,
          reason.chainItemIds.join('>'),
        ].join('|'),
        reason,
      ])).values());
      action.sourcePriorityWarnings = action.sourcePriorityWarnings
        ? Array.from(new Map(action.sourcePriorityWarnings.map((warning) => [
          `${warning.listId}|${warning.targetItemId}`,
          warning,
        ])).values())
        : undefined;
    }

    return Array.from(grouped.values());
  })();

  const hasRecycleActions = recyclePlan.actions.length > 0;
  const hasCraftSteps = satisfiableSteps.length > 0;
  const satisfiableUpgradeSteps = weaponUpgradePlan.steps.filter(step => step.isFullySatisfiable);
  const hasUpgradeSteps = satisfiableUpgradeSteps.length > 0;
  const hasCraftOrUpgradeSteps = hasCraftSteps || hasUpgradeSteps;

  return (
    <div className="crafting-view">
      <div className="crafting-view__controls">
        {showSyncButtons && (
          <>
            <button
              className="qm-button"
              onClick={onSyncMyItems}
              disabled={isSyncingMyItems}
            >
              <RefreshCw size={14} className={isSyncingMyItems ? 'animate-spin' : ''} />
              {t('quartermaster.stash.syncMyItems')}
            </button>
            <button
              className="qm-button"
              onClick={onSyncBlueprints}
              disabled={isSyncingBlueprints}
            >
              <RefreshCw size={14} className={isSyncingBlueprints ? 'animate-spin' : ''} />
              {t('quartermaster.common.syncBlueprints')}
              {blueprintUnlockCount && (
                <span className="crafting-view__button-meta">
                  {tm('quartermaster.crafting.blueprintUnlockCount', blueprintUnlockCount)}
                </span>
              )}
            </button>
          </>
        )}
        {blueprintsSyncedAt && (
          <span className="crafting-view__sync-meta">
            {tm('quartermaster.crafting.blueprintsSynced', { timestamp: formatTimestamp(blueprintsSyncedAt) })}
          </span>
        )}
      </div>

      {/* Repair Section — before Recycle */}
      {plannerResult.repairPlan.actions.length > 0 && (
        <div className="crafting-view__section">
          <h3 className="qm-section-title">
            <Wrench size={18} />
            {t('quartermaster.crafting.repair')}
          </h3>
          <table className="qm-table">
            <colgroup>
              <col className="crafting-view__col-item" />
              <col className="crafting-view__col-name" />
              <col className="crafting-view__col-qty" />
              <col />
              <col className="crafting-view__col-why" />
            </colgroup>
            <thead>
              <tr>
                <th style={{ width: 80 }}>{t('quartermaster.crafting.columns.item')}</th>
                <th>{t('quartermaster.crafting.columns.name')}</th>
                <th style={{ width: 100 }}>{t('quartermaster.crafting.columns.durability')}</th>
                <th>{t('quartermaster.crafting.columns.inputsNeeded')}</th>
                <th>{t('quartermaster.crafting.columns.why')}</th>
              </tr>
            </thead>
            <tbody>
              {plannerResult.repairPlan.actions.map((action) => {
                const item = itemsMap[action.itemId];
                if (!item) return null;
                const whyEntries = action.listSources.map((source) => ({
                  key: `${action.itemId}-${source.listId}`,
                  listName: source.listName,
                  listType: source.listType,
                  quantity: source.quantity,
                  missing: 0,
                  isComplete: true,
                }));
                return (
                  <tr key={`${action.itemId}-${action.instanceIndex}`}>
                    <td>
                      <ItemIcon
                        itemId={item.id}
                        name={item.name}
                        icon={item.icon}
                        rarity={item.rarity}
                        quantity={getOwnedQuantity(item.id)}
                        size="sm"
                        showName={false}
                        tooltipContext={tooltipContext}
                      />
                    </td>
                    <td><span className="qm-item-name">{item.name}</span></td>
                    <td>
                      <span className="crafting-view__durability" style={{
                        color: action.durabilityPercent < 30 ? '#e74c3c'
                          : action.durabilityPercent <= 70 ? '#f0ad4e'
                          : '#27ae60',
                      }}>
                        {action.durabilityPercent.toFixed(1)}%
                      </span>
                    </td>
                    <td>{renderMaterialRows(action.materialsNeeded, { mode: 'input' })}</td>
                    <td>{renderWhyEntries(whyEntries, { showState: false })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Recycle First Section */}
      {hasRecycleActions && (
        <div className="crafting-view__section">
          <h3 className="qm-section-title">{t('quartermaster.crafting.step1')}</h3>
          <table className="qm-table">
            <colgroup>
              <col className="crafting-view__col-item" />
              <col className="crafting-view__col-name" />
              <col className="crafting-view__col-qty" />
              <col />
              <col className="crafting-view__col-why" />
            </colgroup>
            <thead>
              <tr>
                <th style={{ width: 80 }}>{t('quartermaster.crafting.columns.item')}</th>
                <th>{t('quartermaster.crafting.columns.name')}</th>
                <th style={{ width: 100 }}>{t('quartermaster.crafting.columns.qtyToRecycle')}</th>
                <th>{t('quartermaster.crafting.columns.yields')}</th>
                <th>{t('quartermaster.crafting.columns.why')}</th>
              </tr>
            </thead>
            <tbody>
              {groupedRecycleActions.map((action) => {
                const item = itemsMap[action.srcItemId];
                if (!item) return null;

                return (
                  <tr key={action.srcItemId}>
                    <td>
                      <ItemIcon
                        itemId={item.id}
                        name={item.name}
                        icon={item.icon}
                        rarity={item.rarity}
                        quantity={getOwnedQuantity(item.id)}
                        size="sm"
                        showName={false}
                        tooltipContext={tooltipContext}
                      />
                    </td>
                    <td><span className="qm-item-name">{item.name}</span></td>
                    <td>{action.qtyToRecycle}</td>
                    <td>{renderMaterialRows(action.yields, {
                      mode: 'yield',
                      highlightedItemIds: new Set(action.reasons.map((reason) => reason.producedItemId)),
                    })}</td>
                    <td>
                      {renderWhyEntries(getRecycleWhyEntries(action), { showState: false })}
                      {renderRecyclePriorityWarning(action)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Craft Plan Section */}
      {hasCraftOrUpgradeSteps ? (
        <div className="crafting-view__section">
          <h3 className="qm-section-title">
            {hasRecycleActions ? t('quartermaster.crafting.step2') : t('quartermaster.crafting.craftItems')}
          </h3>
          
          {BENCH_ORDER.map(benchId => {
            const steps = stepsByBench[benchId];
            if (steps.length === 0 && (benchId !== 'weapon_bench' || !hasUpgradeSteps)) return null;

            return (
              <div key={benchId} className="crafting-view__bench-group">
                {steps.length > 0 && (
                  <>
                    <div className="crafting-view__bench-header">
                      <Hammer size={16} />
                      {benchId === 'weapon_bench' ? t('quartermaster.crafting.gunsmithCraft') : getLocalizedBenchName(t, benchId)}
                    </div>
                    <table className="qm-table">
                      <colgroup>
                        <col className="crafting-view__col-item" />
                        <col className="crafting-view__col-name" />
                        <col className="crafting-view__col-qty" />
                        <col />
                        <col className="crafting-view__col-why" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th style={{ width: 80 }}>{t('quartermaster.crafting.columns.item')}</th>
                          <th>{t('quartermaster.crafting.columns.name')}</th>
                          <th style={{ width: 100 }}>{t('quartermaster.crafting.columns.output')}</th>
                          <th>{t('quartermaster.crafting.columns.inputsNeeded')}</th>
                          <th>{t('quartermaster.crafting.columns.why')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {steps.map(step => {
                          const item = itemsMap[step.itemId];
                          if (!item) return null;

                          const craftTimes = Math.ceil(step.qty / item.craftQuantity);

                          return (
                            <tr key={step.itemId}>
                              <td>
                                <ItemIcon
                                  itemId={item.id}
                                  name={item.name}
                                  icon={item.icon}
                                  rarity={item.rarity}
                                  quantity={getOwnedQuantity(item.id)}
                                  size="sm"
                                  showName={false}
                                  tooltipContext={tooltipContext}
                                />
                              </td>
                              <td><span className="qm-item-name">{item.name}</span></td>
                              <td>{renderOutputQuantity(step.qty, craftTimes)}</td>
                              <td>{item.recipe ? renderMaterialRows(
                                Object.fromEntries(
                                  Object.entries(item.recipe).map(([inputId, qtyPerCraft]) => [inputId, qtyPerCraft * craftTimes]),
                                ),
                                { mode: 'input' },
                              ) : null}</td>
                              <td>{renderWhyEntries(getCraftWhyEntries(step.itemId))}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                )}
                {benchId === 'weapon_bench' && hasUpgradeSteps && (
                  <>
                    <div className="crafting-view__bench-header">
                      <Hammer size={16} />
                      {t('quartermaster.crafting.gunsmithUpgradeWeapons')}
                    </div>
                    <table className="qm-table">
                      <colgroup>
                        <col className="crafting-view__col-item" />
                        <col className="crafting-view__col-name" />
                        <col className="crafting-view__col-name" />
                        <col className="crafting-view__col-qty" />
                        <col />
                        <col className="crafting-view__col-why" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th style={{ width: 80 }}>{t('quartermaster.crafting.columns.item')}</th>
                          <th>{t('quartermaster.crafting.columns.upgradeFrom')}</th>
                          <th>{t('quartermaster.crafting.columns.upgradeTo')}</th>
                          <th style={{ width: 100 }}>{t('quartermaster.crafting.columns.qtyToUpgrade')}</th>
                          <th>{t('quartermaster.crafting.columns.inputsNeeded')}</th>
                          <th>{t('quartermaster.crafting.columns.why')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {satisfiableUpgradeSteps.map(step => {
                          const fromItem = itemsMap[step.fromItemId];
                          const toItem = itemsMap[step.toItemId];
                          if (!fromItem || !toItem) return null;

                          return (
                            <tr key={`${step.fromItemId}-${step.toItemId}`}>
                              <td>
                                <ItemIcon
                                  itemId={toItem.id}
                                  name={toItem.name}
                                  icon={toItem.icon}
                                  rarity={toItem.rarity}
                                  quantity={getOwnedQuantity(toItem.id)}
                                  size="sm"
                                  showName={false}
                                  tooltipContext={tooltipContext}
                                />
                              </td>
                              <td><span className="qm-item-name">{fromItem.name}</span></td>
                              <td><span className="qm-item-name">{toItem.name}</span></td>
                              <td>{step.qty}</td>
                              <td>{renderMaterialRows(
                                Object.fromEntries(
                                  Object.entries(step.upgradeCost).map(([inputId, qtyPerUpgrade]) => [inputId, qtyPerUpgrade * step.qty]),
                                ),
                                { mode: 'input' },
                              )}</td>
                              <td>{renderWhyEntries(getCraftWhyEntries(step.toItemId))}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="qm-empty-state">
          <Hammer size={48} />
          <p>{t('quartermaster.crafting.empty')}</p>
        </div>
      )}
    </div>
  );
}
