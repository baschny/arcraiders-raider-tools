/**
 * Crafting View Component
 * See specification section 7.6
 */

import { RefreshCw, Hammer } from 'lucide-react';
import type { ItemsMap, BenchId } from '../../types/item';
import type { CraftPlan, RecyclePlan } from '../../types/planner';
import { BENCH_ORDER } from '../../types/item';
import { ItemIcon } from '../ItemIcon';

interface CraftingViewProps {
  itemsMap: ItemsMap;
  craftPlan: CraftPlan;
  recyclePlan: RecyclePlan;
  onSyncStash: () => void;
  isSyncing: boolean;
}

const BENCH_NAMES: Record<BenchId, string> = {
  refiner: 'Refiner',
  equipment_bench: 'Equipment Bench',
  explosives_bench: 'Explosives Bench',
  med_station: 'Med Station',
  utility_bench: 'Utility Bench',
  weapon_bench: 'Weapon Bench',
  workbench: 'Workbench',
};

export function CraftingView({
  itemsMap,
  craftPlan,
  recyclePlan,
  onSyncStash,
  isSyncing,
}: CraftingViewProps) {
  // Group craft steps by bench
  const stepsByBench = BENCH_ORDER.reduce((acc, benchId) => {
    acc[benchId] = craftPlan.steps.filter(step => step.benchId === benchId);
    return acc;
  }, {} as Record<BenchId, typeof craftPlan.steps>);

  const hasRecycleActions = recyclePlan.actions.length > 0;
  const hasCraftSteps = craftPlan.steps.length > 0;

  return (
    <div className="crafting-view">
      <div className="crafting-view__controls">
        <button 
          className="qm-button" 
          onClick={onSyncStash}
          disabled={isSyncing}
        >
          <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
          Sync Inventory
        </button>
      </div>

      {/* Recycle First Section */}
      {hasRecycleActions && (
        <div className="crafting-view__section">
          <h3 className="qm-section-title">Step 1: Recycle First</h3>
          <table className="qm-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>Item</th>
                <th>Name</th>
                <th style={{ width: 100 }}>Qty to Recycle</th>
                <th>Yields</th>
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
                        quantity={action.qtyToRecycle}
                        size="sm"
                        showName={false}
                      />
                    </td>
                    <td>{item.name}</td>
                    <td>{action.qtyToRecycle}</td>
                    <td>
                      <div className="crafting-view__yields">
                        {Object.entries(action.yields).map(([yieldId, qty]) => {
                          const yieldItem = itemsMap[yieldId];
                          return (
                            <span key={yieldId} className="crafting-view__yield">
                              {qty}x {yieldItem?.name ?? yieldId}
                            </span>
                          );
                        })}
                      </div>
                    </td>
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
            {hasRecycleActions ? 'Step 2: Craft Items' : 'Craft Items'}
          </h3>
          
          {BENCH_ORDER.map(benchId => {
            const steps = stepsByBench[benchId];
            if (steps.length === 0) return null;

            return (
              <div key={benchId} className="crafting-view__bench-group">
                <div className="crafting-view__bench-header">
                  <Hammer size={16} />
                  {BENCH_NAMES[benchId]}
                </div>
                <table className="qm-table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>Item</th>
                      <th>Name</th>
                      <th style={{ width: 100 }}>Craft Times</th>
                      <th style={{ width: 100 }}>Total Output</th>
                      <th>Inputs Needed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map(step => {
                      const item = itemsMap[step.itemId];
                      if (!item) return null;

                      const craftTimes = Math.ceil(step.qty / item.craftQuantity);

                      return (
                        <tr key={step.itemId} style={{ opacity: step.isUncraftable ? 0.5 : 1 }}>
                          <td>
                            <ItemIcon
                              itemId={item.id}
                              name={item.name}
                              icon={item.icon}
                              rarity={item.rarity}
                              quantity={step.qty}
                              size="sm"
                              showName={false}
                            />
                          </td>
                          <td>
                            {item.name}
                            {step.isUncraftable && (
                              <span style={{ color: '#ff5722', marginLeft: 8, fontSize: 10 }}>
                                ({step.uncraftableReason === 'cycle' ? 'Cycle' : 'Blueprint/Bench'})
                              </span>
                            )}
                          </td>
                          <td>{craftTimes}</td>
                          <td>{step.qty}</td>
                          <td>
                            <div className="crafting-view__inputs">
                              {item.recipe && Object.entries(item.recipe).map(([inputId, qtyPerCraft]) => {
                                const inputItem = itemsMap[inputId];
                                const totalNeeded = qtyPerCraft * craftTimes;
                                return (
                                  <span key={inputId} className="crafting-view__input-item">
                                    {totalNeeded}x {inputItem?.name ?? inputId}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
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
          <p>No crafting needed. All required items are in your stash!</p>
        </div>
      )}
    </div>
  );
}
