import { useState, useEffect } from 'react';
import type { StackSize, RequiredItem, CraftingRecipe } from '../types/crafting';
import type { Item } from '../types/item';
import type { CachedStash, CachedLoadout } from '../../../shared/types/arctracker';
import { calculateCrafting } from '../utils/calculations';
import { CraftingResults } from './CraftingResults';
import { ItemSearch } from './ItemSearch';
import { loadItems, getItem } from '../utils/itemData';
import { trackCraftCalculatorItemSelection } from '../../../shared/utils/analytics';
import { isCraftableItem, calculateTotalMaterials, getUpgradeBreakdown } from '../utils/weaponTiers';
import type { UpgradeBreakdown } from '../utils/weaponTiers';
import { UpgradeBreakdown as UpgradeBreakdownComponent } from './UpgradeBreakdown';
import { useLocale } from '../../../shared/context/LocaleContext';
import { ItemIcon } from '../../../shared/components/ItemIcon';
import { aggregateInventoryQuantities } from '../../../shared/utils/inventoryAggregator';

interface RequiredItemWithName extends RequiredItem {
  name?: string;
  imageUrl?: string;
  value?: number | null;
  rarity?: string;
}

interface CraftCalculatorProps {
  cachedStash?: CachedStash | null;
  cachedLoadout?: CachedLoadout | null;
}

export function CraftCalculator({ cachedStash, cachedLoadout }: CraftCalculatorProps) {
  const { locale, t, tm, formatNumber } = useLocale();
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [craftedStackSize, setCraftedStackSize] = useState<StackSize>(10);
  const [craftedInStash, setCraftedInStash] = useState(0);
  const craftedIncomplete = craftedInStash % craftedStackSize;
  const [requiredItems, setRequiredItems] = useState<RequiredItemWithName[]>([]);
  const [upgradeBreakdown, setUpgradeBreakdown] = useState<UpgradeBreakdown[]>([]);
  const fallbackItemLabel = (index: number) => tm('craftCalculator.itemFallback', { index });

  useEffect(() => {
    loadItems(locale)
      .then(() => setLoading(false))
      .catch((err) => {
        console.error('Failed to load items:', err);
        setLoading(false);
      });
  }, [locale]);

  const handleItemSelect = (item: Item) => {
    setSelectedItem(item);
    setCraftedStackSize((item.stackSize as StackSize) || 1);

    const inventory = aggregateInventoryQuantities(cachedStash ?? null, cachedLoadout ?? null);

    const ownedCrafted = inventory.get(item.id) ?? 0;
    setCraftedInStash(ownedCrafted);

    trackCraftCalculatorItemSelection(item.name, item.id);

    const totalMaterials = calculateTotalMaterials(item);

    const breakdown = getUpgradeBreakdown(item);
    setUpgradeBreakdown(breakdown);

    const materials = Object.entries(totalMaterials).map(([materialId, amount]) => {
      const materialItem = getItem(materialId);
      const possessed = inventory.get(materialId) ?? 0;
      return {
        id: materialId,
        stackSize: (materialItem?.stackSize as StackSize) || 1,
        amountRequired: amount,
        amountPossessed: possessed,
        incompleteStackSize: possessed % (materialItem?.stackSize || 1),
        name: materialItem?.name || materialId,
        imageUrl: materialItem?.imageFilename,
        value: materialItem?.value,
        rarity: materialItem?.rarity,
      };
    });
    setRequiredItems(materials);
  };



  const recipe: CraftingRecipe = {
    craftedItem: {
      stackSize: craftedStackSize,
      incompleteStackSize: craftedIncomplete,
      craftQuantity: selectedItem?.craftQuantity ?? 1,
    },
    requiredItems,
  };

  const result = calculateCrafting(recipe);
  const canCalculate = requiredItems.some((item) => item.amountPossessed > 0);

  // Calculate profit per craft operation (not per item)
  const profitPerCraft = (() => {
    if (!selectedItem?.value || requiredItems.length === 0) return null;
    const hasAllValues = requiredItems.every(item => item.value != null);
    if (!hasAllValues) return null;
    
    const totalInvestment = requiredItems.reduce((sum, item) => {
      if (item.value != null) {
        return sum + (item.value * item.amountRequired);
      }
      return sum;
    }, 0);
    
    const craftQuantity = selectedItem.craftQuantity ?? 1;
    const returnValue = selectedItem.value * craftQuantity;
    
    return returnValue - totalInvestment;
  })();

  if (loading) {
    return (
      <div className="calculator">
        <div className="card">
          <p style={{ textAlign: 'center', color: '#888' }}>{t('craftCalculator.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="calculator">
      <div className="card">
        <h2 className="card-title">{t('craftCalculator.selectItemTitle')}</h2>
        <div className="form-group">
          <label>{t('craftCalculator.searchLabel')}</label>
          <ItemSearch
            onSelect={handleItemSelect}
            placeholder={t('craftCalculator.searchPlaceholder')}
            filter={isCraftableItem}
          />
        </div>
      </div>

      {selectedItem && (
        <div className="card">
          <h2 className="card-title">{t('craftCalculator.craftedItemTitle')}</h2>
          <div className="selected-item-display">
            {selectedItem.imageFilename && (
              <ItemIcon itemId={selectedItem.id} name={selectedItem.name} icon={selectedItem.imageFilename} rarity={selectedItem.rarity} showName={false} />
            )}
            <div className="item-header" style={{ flex: 1 }}>
              <div>
                <h3 style={{ margin: 0 }}>{selectedItem.name}</h3>
                <p style={{ color: '#888', fontSize: '14px', margin: '4px 0 0 0' }}>
                  {t('craftCalculator.stackSize')}: {selectedItem.stackSize}
                </p>
                {selectedItem.value != null && (
                  <p style={{ color: '#888', fontSize: '14px', margin: '4px 0 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <img src="/images/icon-coin.webp" alt="coin" style={{ width: '18px', height: '18px' }} />
                    {formatNumber(selectedItem.value)}
                  </p>
                )}
                <button
                  onClick={() => {
                    setSelectedItem(null);
                    setRequiredItems([]);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#4fc3f7',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '12px',
                    marginTop: '4px',
                  }}
                >
                  {t('craftCalculator.changeItem')}
                </button>
              </div>
            </div>
            <div className="input-with-label">
              <label>{t('craftCalculator.inStash')}</label>
              <input
                type="number"
                min="0"
                value={craftedInStash}
                onChange={(e) => setCraftedInStash(Math.max(0, Number(e.target.value)))}
                placeholder="0"
              />
            </div>
          </div>
        </div>
      )}


      {selectedItem && (
        <div className="card">
          <div className="card-title-with-info">
            <h2 className="card-title">{t('craftCalculator.requiredItemsTitle')}</h2>
            <UpgradeBreakdownComponent breakdown={upgradeBreakdown} />
          </div>
          {requiredItems.map((item, index) => (
            <div key={item.id} className="required-item">
              <div className="item-header">
                {item.imageUrl && (
                  <ItemIcon itemId={item.id} name={item.name || fallbackItemLabel(index + 1)} icon={item.imageUrl} rarity={item.rarity} showName={false} style={{ '--item-icon-size': '40px' } as React.CSSProperties} />
                )}
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0 }}>
                    <span style={{ color: '#4fc3f7', marginRight: '6px' }}>{item.amountRequired}x</span>
                    {item.name || fallbackItemLabel(index + 1)}
                  </h3>
                  {item.value != null && (
                    <p style={{ color: '#888', fontSize: '14px', margin: '4px 0 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ color: '#4fc3f7' }}>{item.amountRequired}x</span>
                      <img src="/images/icon-coin.webp" alt="coin" style={{ width: '18px', height: '18px' }} />
                      {formatNumber(item.value)}
                      {item.amountRequired > 1 && (
                        <>
                          <span style={{ marginLeft: '4px' }}>=</span>
                          <img src="/images/icon-coin.webp" alt="coin" style={{ width: '18px', height: '18px' }} />
                          {formatNumber(item.value * item.amountRequired)}
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>
              <div className="input-with-label">
                <label>{t('craftCalculator.inStash')}</label>
                <input
                  type="number"
                  min="0"
                  value={item.amountPossessed}
                  onChange={(e) => {
                    const possessed = Math.max(0, Number(e.target.value));
                    const updatedItems = requiredItems.map((reqItem) =>
                      reqItem.id === item.id
                        ? {
                            ...reqItem,
                            amountPossessed: possessed,
                            incompleteStackSize: possessed % item.stackSize,
                          }
                        : reqItem
                    );
                    setRequiredItems(updatedItems);
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedItem && selectedItem.value != null && requiredItems.length > 0 && (() => {
        const totalInvestment = requiredItems.reduce((sum, item) => {
          if (item.value != null) {
            return sum + (item.value * item.amountRequired);
          }
          return sum;
        }, 0);
        const craftQuantity = selectedItem.craftQuantity ?? 1;
        const returnValue = selectedItem.value * craftQuantity;
        const profit = returnValue - totalInvestment;
        const hasAllValues = requiredItems.every(item => item.value != null);

        if (!hasAllValues) return null;

        let profitColor: string;
        let profitLabel: string;
        if (profit > 0) {
          profitColor = '#4caf50'; // green
          profitLabel = t('craftCalculator.profit');
        } else if (profit < 0) {
          profitColor = '#f44336'; // red
          profitLabel = t('craftCalculator.deficit');
        } else {
          profitColor = '#ff9800'; // orange
          profitLabel = t('craftCalculator.breakEven');
        }

        return (
          <div className="card">
            <h2 className="card-title">{t('craftCalculator.craftingEconomicsTitle')}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#888', fontSize: '14px' }}>{t('craftCalculator.investment')}:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '16px' }}>
                  <img src="/images/icon-coin.webp" alt="coin" style={{ width: '18px', height: '18px' }} />
                  <span style={{ fontWeight: 'bold' }}>{formatNumber(totalInvestment)}</span>
                </div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#888', fontSize: '14px' }}>
                  {craftQuantity > 1
                    ? tm('craftCalculator.returnMultiple', { count: craftQuantity })
                    : t('craftCalculator.returnSingle')}
                  :
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '16px' }}>
                  <img src="/images/icon-coin.webp" alt="coin" style={{ width: '18px', height: '18px' }} />
                  <span style={{ fontWeight: 'bold' }}>{formatNumber(returnValue)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px', marginTop: '4px' }}>
                <span style={{ color: '#888', fontSize: '14px' }}>{profitLabel}:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '18px' }}>
                  <img src="/images/icon-coin.webp" alt="coin" style={{ width: '18px', height: '18px' }} />
                  <span style={{ fontWeight: 'bold', color: profitColor }}>
                    {profit > 0 ? '+' : ''}{formatNumber(profit)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      </div>

      {canCalculate && (
        <div className="results-sidebar">
          <CraftingResults result={result} profitPerCraft={profitPerCraft} />
        </div>
      )}
    </>
  );
}
