/**
 * Loadouts View Component
 * See specification section 7.4
 */

import { useState, useMemo } from 'react';
import { Plus, Trash2, Eye, EyeOff, List } from 'lucide-react';
import type { ItemsMap } from '../../types/item';
import type { StoredLoadout } from '../../types/loadout';
import { LOADOUT_CATEGORY_ORDER } from '../../types/loadout';
import { ItemIcon } from '../ItemIcon';
import { searchItems } from '../../utils/dataLoader';

interface LoadoutsViewProps {
  itemsMap: ItemsMap;
  loadouts: StoredLoadout[];
  onCreateLoadout: (name: string) => void;
  onDeleteLoadout: (id: string) => void;
  onToggleLoadout: (id: string) => void;
  onRenameLoadout: (id: string, name: string) => void;
  onAddItem: (loadoutId: string, itemId: string, quantity: number) => void;
  onRemoveItem: (loadoutId: string, itemId: string) => void;
  onUpdateQuantity: (loadoutId: string, itemId: string, quantity: number) => void;
  onToggleItem: (loadoutId: string, itemId: string) => void;
}

export function LoadoutsView({
  itemsMap,
  loadouts,
  onCreateLoadout,
  onDeleteLoadout,
  onToggleLoadout,
  onRenameLoadout,
  onAddItem,
  onRemoveItem,
  onUpdateQuantity,
  onToggleItem,
}: LoadoutsViewProps) {
  const [selectedLoadoutId, setSelectedLoadoutId] = useState<string | null>(
    loadouts.length > 0 ? loadouts[0].id : null
  );
  const [newLoadoutName, setNewLoadoutName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const selectedLoadout = loadouts.find(l => l.id === selectedLoadoutId);

  // Search results for autocomplete
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchItems(itemsMap, searchQuery).slice(0, 10);
  }, [itemsMap, searchQuery]);

  // Group loadout items by category
  const groupedItems = useMemo(() => {
    if (!selectedLoadout) return {};
    
    const groups: Record<string, typeof selectedLoadout.items> = {};
    
    for (const loadoutItem of selectedLoadout.items) {
      const item = itemsMap[loadoutItem.itemId];
      if (!item) continue;
      
      // Find matching category from LOADOUT_CATEGORY_ORDER
      let category = 'Other';
      for (const cat of LOADOUT_CATEGORY_ORDER) {
        if (item.category === cat || item.category === 'Weapon' && cat === 'Weapon') {
          category = cat;
          break;
        }
      }
      
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(loadoutItem);
    }
    
    return groups;
  }, [selectedLoadout, itemsMap]);

  const handleCreateLoadout = () => {
    if (!newLoadoutName.trim()) return;
    onCreateLoadout(newLoadoutName.trim());
    setNewLoadoutName('');
  };

  const handleAddItem = (itemId: string) => {
    if (!selectedLoadoutId) return;
    const item = itemsMap[itemId];
    const quantity = item?.craftQuantity ?? 1;
    onAddItem(selectedLoadoutId, itemId, quantity);
    setSearchQuery('');
    setShowSuggestions(false);
  };

  const handleQuantityChange = (itemId: string, delta: number) => {
    if (!selectedLoadoutId || !selectedLoadout) return;
    const loadoutItem = selectedLoadout.items.find(i => i.itemId === itemId);
    if (!loadoutItem) return;
    
    const item = itemsMap[itemId];
    const step = item?.craftQuantity ?? 1;
    const newQty = Math.max(step, loadoutItem.quantity + delta * step);
    onUpdateQuantity(selectedLoadoutId, itemId, newQty);
  };

  return (
    <div className="loadouts-view">
      {/* Loadout List */}
      <div className="loadouts-view__list">
        <div className="loadouts-view__list-header">
          <span className="loadouts-view__list-title">Loadouts</span>
        </div>

        <div className="loadouts-view__items">
          {loadouts.map(loadout => (
            <div
              key={loadout.id}
              className={`loadouts-view__item ${loadout.id === selectedLoadoutId ? 'loadouts-view__item--active' : ''} ${!loadout.isEnabled ? 'loadouts-view__item--disabled' : ''}`}
              onClick={() => setSelectedLoadoutId(loadout.id)}
            >
              <span className="loadouts-view__item-name">{loadout.name}</span>
              <span
                className="loadouts-view__item-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLoadout(loadout.id);
                }}
              >
                {loadout.isEnabled ? <Eye size={14} /> : <EyeOff size={14} />}
              </span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid #444' }}>
          <input
            type="text"
            className="qm-input"
            placeholder="New loadout name..."
            value={newLoadoutName}
            onChange={(e) => setNewLoadoutName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateLoadout()}
            style={{ width: '100%', marginBottom: 8 }}
          />
          <button
            className="qm-button qm-button--primary"
            onClick={handleCreateLoadout}
            disabled={!newLoadoutName.trim()}
            style={{ width: '100%' }}
          >
            <Plus size={14} /> Create Loadout
          </button>
        </div>
      </div>

      {/* Loadout Editor */}
      <div className="loadouts-view__editor">
        {selectedLoadout ? (
          <>
            <div className="loadouts-view__editor-header">
              <input
                type="text"
                className="qm-input"
                value={selectedLoadout.name}
                onChange={(e) => onRenameLoadout(selectedLoadout.id, e.target.value)}
                style={{ fontSize: 14, fontWeight: 600 }}
              />
              <button
                className="qm-button"
                onClick={() => {
                  onDeleteLoadout(selectedLoadout.id);
                  setSelectedLoadoutId(loadouts.find(l => l.id !== selectedLoadout.id)?.id ?? null);
                }}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>

            {/* Add Item */}
            <div className="loadouts-view__add-item" style={{ position: 'relative' }}>
              <input
                type="text"
                className="qm-input"
                placeholder="Search items to add..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
              />
              {showSuggestions && searchResults.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: '#2c2c2c',
                  border: '1px solid #444',
                  borderRadius: 4,
                  maxHeight: 200,
                  overflowY: 'auto',
                  zIndex: 100,
                }}>
                  {searchResults.map(item => (
                    <div
                      key={item.id}
                      onClick={() => handleAddItem(item.id)}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#3c3c3c')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <img src={item.icon} alt="" style={{ width: 24, height: 24 }} />
                      <span style={{ fontSize: 11 }}>{item.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Grouped Items */}
            <div className="loadouts-view__groups">
              {LOADOUT_CATEGORY_ORDER.map(category => {
                const items = groupedItems[category];
                if (!items || items.length === 0) return null;

                return (
                  <div key={category} className="loadouts-view__group">
                    <div className="loadouts-view__group-title">{category}</div>
                    <div className="loadouts-view__group-items">
                      {items.map(loadoutItem => {
                        const item = itemsMap[loadoutItem.itemId];
                        if (!item) return null;

                        return (
                          <div
                            key={loadoutItem.itemId}
                            className={`loadouts-view__loadout-item ${!loadoutItem.isEnabled ? 'loadouts-view__loadout-item--disabled' : ''}`}
                          >
                            <ItemIcon
                              itemId={item.id}
                              name={item.name}
                              icon={item.icon}
                              rarity={item.rarity}
                              quantity={loadoutItem.quantity}
                              size="sm"
                              showName={false}
                            />
                            <div className="loadouts-view__item-controls">
                              <button
                                className="qm-button qm-button--small"
                                onClick={() => handleQuantityChange(loadoutItem.itemId, -1)}
                              >
                                -
                              </button>
                              <input
                                type="number"
                                className="qm-input loadouts-view__qty-input"
                                value={loadoutItem.quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  if (!isNaN(val) && val > 0) {
                                    onUpdateQuantity(selectedLoadout.id, loadoutItem.itemId, val);
                                  }
                                }}
                                min={1}
                              />
                              <button
                                className="qm-button qm-button--small"
                                onClick={() => handleQuantityChange(loadoutItem.itemId, 1)}
                              >
                                +
                              </button>
                              <button
                                className="qm-button qm-button--small"
                                onClick={() => onToggleItem(selectedLoadout.id, loadoutItem.itemId)}
                              >
                                {loadoutItem.isEnabled ? <Eye size={12} /> : <EyeOff size={12} />}
                              </button>
                              <button
                                className="qm-button qm-button--small"
                                onClick={() => onRemoveItem(selectedLoadout.id, loadoutItem.itemId)}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="qm-empty-state">
            <List size={48} />
            <p>Select or create a loadout to edit.</p>
          </div>
        )}
      </div>
    </div>
  );
}
