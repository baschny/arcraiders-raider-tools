import { useState, useEffect } from 'react';
import type { StackSize, RequiredItem, CraftingRecipe } from '../types/crafting';
import type { Item } from '../types/item';
import { calculateCrafting } from '../utils/calculations';
import { CraftingResults } from './CraftingResults';
import { ItemSearch } from './ItemSearch';
import { loadItems, getItem } from '../utils/itemData';
import { trackCraftCalculatorItemSelection } from '../../../shared/utils/analytics';
import { isCraftableItem, calculateTotalMaterials, getUpgradeBreakdown } from '../utils/weaponTiers';
import type { UpgradeBreakdown } from '../utils/weaponTiers';
import { UpgradeBreakdown as UpgradeBreakdownComponent } from './UpgradeBreakdown';

interface RequiredItemWithName extends RequiredItem {
  name?: string;
  imageUrl?: string;
  value?: number | null;
}

const formatValue = (value: number): string => {
  return value.toLocaleString('en-US');
};

export function CraftCalculator() {
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [craftedStackSize, setCraftedStackSize] = useState<StackSize>(10);
  const [craftedInStash, setCraftedInStash] = useState(0);
  const craftedIncomplete = craftedInStash % craftedStackSize;
  const [requiredItems, setRequiredItems] = useState<RequiredItemWithName[]>([]);
  const [upgradeBreakdown, setUpgradeBreakdown] = useState<UpgradeBreakdown[]>([]);

  useEffect(() => {
    loadItems()
      .then(() => setLoading(false))
      .catch((err) => {
        console.error('Failed to load items:', err);
        setLoading(false);
      });
  }, []);

  const handleItemSelect = (item: Item) => {
    setSelectedItem(item);
    setCraftedStackSize((item.stackSize as StackSize) || 1);
    setCraftedInStash(0);

    // Track the item selection
    trackCraftCalculatorItemSelection(item.name, item.id);

    // Get total materials (either direct recipe or calculated from upgrades)
    const totalMaterials = calculateTotalMaterials(item);
    
    // Get upgrade breakdown for tooltip (if applicable)
    const breakdown = getUpgradeBreakdown(item);
    setUpgradeBreakdown(breakdown);

    // Map materials to required items
    const materials = Object.entries(totalMaterials).map(([materialId, amount]) => {
      const materialItem = getItem(materialId);
      return {
        id: materialId,
        stackSize: (materialItem?.stackSize as StackSize) || 1,
        amountRequired: amount,
        amountPossessed: 0,
        incompleteStackSize: 0,
        name: materialItem?.name || materialId,
        imageUrl: materialItem?.imageFilename,
        value: materialItem?.value,
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
          <p style={{ textAlign: 'center', color: '#888' }}>Loading item data...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="calculator">
      <div className="card">
        <h2 className="card-title">Select Item to Craft</h2>
        <div className="form-group">
          <label>Search for craftable item</label>
          <ItemSearch
            onSelect={handleItemSelect}
            placeholder="Type item name..."
            filter={isCraftableItem}
          />
        </div>
      </div>

      {selectedItem && (
        <div className="card">
          <h2 className="card-title">Crafted Item</h2>
          <div className="selected-item-display">
            {selectedItem.imageFilename && (
              <img
                src={selectedItem.imageFilename}
                alt={selectedItem.name}
                className="selected-item-image"
              />
            )}
            <div className="item-header" style={{ flex: 1 }}>
              <div>
                <h3 style={{ margin: 0 }}>{selectedItem.name}</h3>
                <p style={{ color: '#888', fontSize: '14px', margin: '4px 0 0 0' }}>
                  Stack Size: {selectedItem.stackSize}
                </p>
                {selectedItem.value != null && (
                  <p style={{ color: '#888', fontSize: '14px', margin: '4px 0 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <img src="/images/icon-coin.webp" alt="coin" style={{ width: '18px', height: '18px' }} />
                    {formatValue(selectedItem.value)}
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
                  Change Item
                </button>
              </div>
            </div>
            <div className="input-with-label">
              <label>In Stash</label>
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
            <h2 className="card-title">Required Items</h2>
            <UpgradeBreakdownComponent breakdown={upgradeBreakdown} />
          </div>
          {requiredItems.map((item, index) => (
            <div key={item.id} className="required-item">
              <div className="item-header">
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt={item.name || `Item ${index + 1}`}
                    style={{
                      width: '24px',
                      height: '24px',
                      objectFit: 'contain',
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: '4px',
                      padding: '2px',
                    }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0 }}>
                    <span style={{ color: '#4fc3f7', marginRight: '6px' }}>{item.amountRequired}x</span>
                    {item.name || `Item ${index + 1}`}
                  </h3>
                  {item.value != null && (
                    <p style={{ color: '#888', fontSize: '14px', margin: '4px 0 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ color: '#4fc3f7' }}>{item.amountRequired}x</span>
                      <img src="/images/icon-coin.webp" alt="coin" style={{ width: '18px', height: '18px' }} />
                      {formatValue(item.value)}
                      {item.amountRequired > 1 && (
                        <>
                          <span style={{ marginLeft: '4px' }}>=</span>
                          <img src="/images/icon-coin.webp" alt="coin" style={{ width: '18px', height: '18px' }} />
                          {formatValue(item.value * item.amountRequired)}
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>
              <div className="input-with-label">
                <label>In Stash</label>
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
          profitLabel = 'Profit';
        } else if (profit < 0) {
          profitColor = '#f44336'; // red
          profitLabel = 'Deficit';
        } else {
          profitColor = '#ff9800'; // orange
          profitLabel = 'Break Even';
        }

        return (
          <div className="card">
            <h2 className="card-title">Crafting Economics</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#888', fontSize: '14px' }}>Investment (Materials):</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '16px' }}>
                  <img src="/images/icon-coin.webp" alt="coin" style={{ width: '18px', height: '18px' }} />
                  <span style={{ fontWeight: 'bold' }}>{formatValue(totalInvestment)}</span>
                </div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#888', fontSize: '14px' }}>
                  Return ({craftQuantity > 1 ? `${craftQuantity}x Crafted Items` : 'Crafted Item'}):
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '16px' }}>
                  <img src="/images/icon-coin.webp" alt="coin" style={{ width: '18px', height: '18px' }} />
                  <span style={{ fontWeight: 'bold' }}>{formatValue(returnValue)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px', marginTop: '4px' }}>
                <span style={{ color: '#888', fontSize: '14px' }}>{profitLabel}:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '18px' }}>
                  <img src="/images/icon-coin.webp" alt="coin" style={{ width: '18px', height: '18px' }} />
                  <span style={{ fontWeight: 'bold', color: profitColor }}>
                    {profit > 0 ? '+' : ''}{formatValue(profit)}
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
