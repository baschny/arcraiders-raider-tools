import { useState, useEffect } from 'react';
import type { StackSize, RequiredItem, CraftingRecipe } from '../types/crafting';
import type { Item } from '../types/item';
import { calculateCrafting } from '../utils/calculations';
import { CraftingResults } from './CraftingResults';
import { ItemSearch } from './ItemSearch';
import { loadItems, getItem } from '../utils/itemData';
import { trackCraftCalculatorItemSelection } from '../../../shared/utils/analytics';

interface RequiredItemWithName extends RequiredItem {
  name?: string;
  imageUrl?: string;
}

export function CraftCalculator() {
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [craftedStackSize, setCraftedStackSize] = useState<StackSize>(10);
  const [craftedInStash, setCraftedInStash] = useState(0);
  const craftedIncomplete = craftedInStash % craftedStackSize;
  const [requiredItems, setRequiredItems] = useState<RequiredItemWithName[]>([]);

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

    if (item.recipe) {
      const materials = Object.entries(item.recipe).map(([materialId, amount]) => {
        const materialItem = getItem(materialId);
        return {
          id: materialId,
          stackSize: (materialItem?.stackSize as StackSize) || 1,
          amountRequired: amount,
          amountPossessed: 0,
          incompleteStackSize: 0,
          name: materialItem?.name || materialId,
          imageUrl: materialItem?.imageFilename,
        };
      });
      setRequiredItems(materials);
    }
  };



  const recipe: CraftingRecipe = {
    craftedItem: {
      stackSize: craftedStackSize,
      incompleteStackSize: craftedIncomplete,
    },
    requiredItems,
  };

  const result = calculateCrafting(recipe);
  const canCalculate = requiredItems.some((item) => item.amountPossessed > 0);

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
            filter={(item) => !!item.recipe && Object.keys(item.recipe).length > 0}
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
          <h2 className="card-title">Required Items</h2>
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
                <h4>
                  <span style={{ color: '#4fc3f7', marginRight: '6px' }}>{item.amountRequired}x</span>
                  {item.name || `Item ${index + 1}`}
                </h4>
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
      </div>

      {canCalculate && (
        <div className="results-sidebar">
          <CraftingResults result={result} />
        </div>
      )}
    </>
  );
}
