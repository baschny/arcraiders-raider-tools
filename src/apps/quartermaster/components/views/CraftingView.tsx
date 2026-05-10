/**
 * Crafting View Component
 * See specification section 7.6
 */

import { RefreshCw, Hammer } from 'lucide-react';
import type { ItemsMap, BenchId } from '../../types/item';
import type { CraftPlan, PlannerResult, RecyclePlan } from '../../types/planner';
import { BENCH_ORDER } from '../../types/item';
import { ItemIcon } from '../ItemIcon';
import type { ItemInsightsMap } from '../../utils/itemInsights';
import { getLocalizedBenchName } from '../../utils/localization';
import { useLocale } from '../../../../shared/context/LocaleContext';

interface CraftingViewProps {
  itemsMap: ItemsMap;
  craftPlan: CraftPlan;
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
}

export function CraftingView({
  itemsMap,
  craftPlan,
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
}: CraftingViewProps) {
  const { t, tm, formatDate } = useLocale();
  // Filter to fully satisfiable targets only (CR-ADD-6.X)
  const satisfiableSteps = craftPlan.steps.filter(step => step.isFullySatisfiable);
  const tooltipContext = {
    itemsMap,
    plannerResult,
    itemInsights,
  };
  const formatTimestamp = (isoString: string): string => {
    try {
      return formatDate(new Date(isoString), { hour: '2-digit', minute: '2-digit' });
    } catch {
      return t('quartermaster.globalHeader.invalid');
    }
  };

  const getCraftWhyEntries = (itemId: string) => {
    const insight = itemInsights[itemId];
    if (!insight) return [];

    const entries = [
      ...insight.finalListNeeds.map((need) => ({
        key: `${need.listId}-${itemId}-final`,
        listName: need.listName,
        targetItemId: itemId,
        targetItemName: itemsMap[itemId]?.name ?? itemId,
        chainLabel: itemsMap[itemId]?.name ?? itemId,
        isComplete: need.isComplete,
      })),
      ...insight.craftingNeeds.map((need, index) => ({
        key: `${need.listId}-${need.targetItemId}-${index}`,
        listName: need.listName,
        targetItemId: need.targetItemId,
        targetItemName: need.targetItemName,
        chainLabel: need.chainLabel,
        isComplete: need.isComplete,
      })),
    ];

    const dedupe = new Map(entries.map((entry) => [entry.key, entry]));
    return Array.from(dedupe.values());
  };

  const getRecycleWhyEntries = (itemId: string) => {
    const insight = itemInsights[itemId];
    if (!insight) return [];
    return insight.recycleSalvageNeeds
      .filter((need) => need.mode === 'recycle')
      .map((need, index) => ({
        key: `${need.listId}-${need.targetItemId}-${need.producedItemId}-${index}`,
        listName: need.listName,
        targetItemId: need.targetItemId,
        targetItemName: need.targetItemName,
        chainLabel: need.chainLabel,
        isComplete: need.isComplete,
      }));
  };

  const renderWhyEntries = (entries: Array<{
    key: string;
    listName: string;
    targetItemId: string;
    targetItemName: string;
    chainLabel: string;
    isComplete: boolean;
  }>) => {
    if (entries.length === 0) {
      return <span className="crafting-view__why-empty">{t('quartermaster.crafting.noImpact')}</span>;
    }

    return (
      <div className="crafting-view__why-list">
        {entries.map((entry) => {
          const targetItem = itemsMap[entry.targetItemId];
          if (!targetItem) return null;

          return (
            <div key={entry.key} className="crafting-view__why-item">
              <ItemIcon
                itemId={targetItem.id}
                name={targetItem.name}
                icon={targetItem.icon}
                rarity={targetItem.rarity}
                quantity={getOwnedQuantity(targetItem.id)}
                size="xs"
                showName={false}
                tooltipContext={tooltipContext}
              />
              <div className="crafting-view__why-copy">
                <div className="crafting-view__why-main">
                  <span>{entry.listName}</span>
                  <span>→</span>
                  <span className="qm-item-name">{entry.targetItemName}</span>
                </div>
                <div className="crafting-view__why-sub">{entry.chainLabel}</div>
              </div>
              <span className={`crafting-view__why-state ${entry.isComplete ? 'crafting-view__why-state--complete' : 'crafting-view__why-state--needed'}`}>
                {entry.isComplete ? t('quartermaster.itemTooltip.complete') : t('quartermaster.itemTooltip.needed')}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderMaterialRows = (materials: Record<string, number>) => (
    <div className="crafting-view__materials">
      {Object.entries(materials).map(([materialId, quantity]) => {
        const material = itemsMap[materialId];
        if (!material) return null;

        return (
          <div className="crafting-view__material-row" key={materialId}>
            <div className="crafting-view__material-main">
              <ItemIcon
                itemId={material.id}
                name={material.name}
                icon={material.icon}
                rarity={material.rarity}
                quantity={getOwnedQuantity(material.id)}
                size="xs"
                showName={false}
                tooltipContext={tooltipContext}
              />
              <span className="qm-item-name">{material.name}</span>
            </div>
            <span className="crafting-view__material-qty">×{quantity}</span>
          </div>
        );
      })}
    </div>
  );

  // Group craft steps by bench
  const stepsByBench = BENCH_ORDER.reduce((acc, benchId) => {
    acc[benchId] = satisfiableSteps.filter(step => step.benchId === benchId);
    return acc;
  }, {} as Record<BenchId, typeof craftPlan.steps>);

  const hasRecycleActions = recyclePlan.actions.length > 0;
  const hasCraftSteps = satisfiableSteps.length > 0;

  return (
    <div className="crafting-view">
      <div className="crafting-view__controls">
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
        {blueprintsSyncedAt && (
          <span className="crafting-view__sync-meta">
            {tm('quartermaster.crafting.blueprintsSynced', { timestamp: formatTimestamp(blueprintsSyncedAt) })}
          </span>
        )}
      </div>

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
              {recyclePlan.actions.map((action, idx) => {
                const item = itemsMap[action.srcItemId];
                if (!item) return null;

                return (
                  <tr key={idx}>
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
                    <td>{renderMaterialRows(action.yields)}</td>
                    <td>{renderWhyEntries(getRecycleWhyEntries(action.srcItemId))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Craft Plan Section */}
      {hasCraftSteps ? (
        <div className="crafting-view__section">
          <h3 className="qm-section-title">
            {hasRecycleActions ? t('quartermaster.crafting.step2') : t('quartermaster.crafting.craftItems')}
          </h3>
          
          {BENCH_ORDER.map(benchId => {
            const steps = stepsByBench[benchId];
            if (steps.length === 0) return null;

            return (
              <div key={benchId} className="crafting-view__bench-group">
                <div className="crafting-view__bench-header">
                  <Hammer size={16} />
                  {getLocalizedBenchName(t, benchId)}
                </div>
                <table className="qm-table">
                  <colgroup>
                    <col className="crafting-view__col-item" />
                    <col className="crafting-view__col-name" />
                    <col className="crafting-view__col-qty" />
                    <col className="crafting-view__col-qty" />
                    <col />
                    <col className="crafting-view__col-why" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{ width: 80 }}>{t('quartermaster.crafting.columns.item')}</th>
                      <th>{t('quartermaster.crafting.columns.name')}</th>
                      <th style={{ width: 100 }}>{t('quartermaster.crafting.columns.craftTimes')}</th>
                      <th style={{ width: 100 }}>{t('quartermaster.crafting.columns.totalOutput')}</th>
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
                          <td>{craftTimes}</td>
                          <td>{step.qty}</td>
                          <td>{item.recipe ? renderMaterialRows(
                            Object.fromEntries(
                              Object.entries(item.recipe).map(([inputId, qtyPerCraft]) => [inputId, qtyPerCraft * craftTimes]),
                            ),
                          ) : null}</td>
                          <td>{renderWhyEntries(getCraftWhyEntries(step.itemId))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
