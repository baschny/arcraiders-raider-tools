import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Item, ItemsMap } from '../types/item';
import { getRarityClass } from '../utils/dataLoader';
import { ItemIconWithInfo } from './ItemIconWithInfo';
import { HelpDialog } from './HelpDialog';
import { trackLootHelperAddGoal } from '../../../shared/utils/analytics';

interface SidebarProps {
  itemsMap: ItemsMap;
  goalItemIds: string[];
  disabledItemIds: Set<string>;
  stashItemIds: Set<string>;
  disabledStashItemIds: Set<string>;
  onAddGoalItem: (itemId: string) => void;
  onRemoveGoalItem: (itemId: string) => void;
  onToggleGoalItem: (itemId: string) => void;
  onReorderGoalItems: (reorderedIds: string[]) => void;
  onEnableAllGoalItems: () => void;
  onDisableAllGoalItems: () => void;
  onToggleDisabledStashItem: (itemId: string) => void;
  onRemoveStashItem: (itemId: string) => void;
}

export function Sidebar({
  itemsMap,
  goalItemIds,
  disabledItemIds,
  stashItemIds,
  disabledStashItemIds,
  onAddGoalItem,
  onRemoveGoalItem,
  onToggleGoalItem,
  onReorderGoalItems,
  onEnableAllGoalItems,
  onDisableAllGoalItems,
  onToggleDisabledStashItem,
  onRemoveStashItem,
}: SidebarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [goalsCollapsed, setGoalsCollapsed] = useState(false);
  const [stashCollapsed, setStashCollapsed] = useState(false);
  const searchTimeoutRef = useRef<number | undefined>(undefined);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchTerm.trim().length < 2) {
      setFilteredItems([]);
      setShowDropdown(false);
      return;
    }

    searchTimeoutRef.current = window.setTimeout(() => {
      const searchLower = searchTerm.toLowerCase();
      const results = Object.values(itemsMap)
        .filter((item) => {
          if (!item.name.en.toLowerCase().includes(searchLower)) {
            return false;
          }
          // Only show craftable items (must have recipe with at least one ingredient)
          return item.recipe && Object.keys(item.recipe).length > 0;
        })
        .slice(0, 20); // Limit results
      
      setFilteredItems(results);
      setShowDropdown(results.length > 0);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, itemsMap]);

  const handleAddItem = (itemId: string) => {
    const item = itemsMap[itemId];
    if (item) {
      // Track the goal item addition
      trackLootHelperAddGoal(item.name.en, itemId);
    }
    onAddGoalItem(itemId);
    setSearchTerm('');
    setShowDropdown(false);
  };

  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    setDraggedItemId(itemId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetItemId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (draggedItemId && draggedItemId !== targetItemId) {
      setDropTargetId(targetItemId);
    }
  };

  const handleDragLeave = () => {
    setDropTargetId(null);
  };

  const handleDrop = (e: React.DragEvent, targetItemId: string) => {
    e.preventDefault();
    
    if (!draggedItemId || draggedItemId === targetItemId) {
      setDraggedItemId(null);
      return;
    }

    const draggedIndex = goalItemIds.indexOf(draggedItemId);
    const targetIndex = goalItemIds.indexOf(targetItemId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedItemId(null);
      return;
    }

    // Create new array with reordered items
    const newOrder = [...goalItemIds];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedItemId);

    onReorderGoalItems(newOrder);
    setDraggedItemId(null);
    setDropTargetId(null);
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
    setDropTargetId(null);
  };

  const goalItems = goalItemIds
    .map((id) => itemsMap[id])
    .filter((item) => item !== undefined);

  const stashItems = Array.from(stashItemIds)
    .map((id) => itemsMap[id])
    .filter((item) => item !== undefined)
    .sort((a, b) => a.name.en.localeCompare(b.name.en));

  return (
    <div className="sidebar">
      <div className="sidebar-content">
        {/* Search Section */}
        <div className="sidebar-section">
          <div className="search-box">
            <div className="search-box-header">
              <label className="sidebar-section-title">Goal Items</label>
              <button 
                className="help-icon-button" 
                onClick={() => setShowHelp(true)}
                title="How to use"
              >
                ?
              </button>
            </div>
            <input
              type="text"
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => {
                if (filteredItems.length > 0) {
                  setShowDropdown(true);
                }
              }}
            />
            
            {showDropdown && (
              <div className="autocomplete-dropdown">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className="autocomplete-dropdown-item"
                    onClick={() => handleAddItem(item.id)}
                  >
                    {item.imageFilename && (
                      <img
                        src={item.imageFilename}
                        alt={item.name.en}
                        className={`autocomplete-dropdown-item-icon ${getRarityClass(item.rarity)}`}
                      />
                    )}
                    <span className="autocomplete-dropdown-item-name">
                      {item.name.en}
                    </span>
                    <div className="autocomplete-dropdown-item-add">+</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Goal Items List */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <div className="sidebar-section-title">Your Goals</div>
            <div className="sidebar-section-actions">
              {goalItems.length > 0 && (
                <>
                  <button
                    onClick={onEnableAllGoalItems}
                    className="sidebar-section-action"
                    disabled={disabledItemIds.size === 0}
                    title="Enable all goal items"
                  >
                    Enable All
                  </button>
                  <button
                    onClick={onDisableAllGoalItems}
                    className="sidebar-section-action"
                    disabled={disabledItemIds.size === goalItems.length}
                    title="Disable all goal items"
                  >
                    Disable All
                  </button>
                </>
              )}
              <button
                className="sidebar-section-toggle"
                onClick={() => setGoalsCollapsed(!goalsCollapsed)}
                title={goalsCollapsed ? 'Expand goals' : 'Collapse goals'}
                disabled={goalItems.length === 0}
              >
                {goalsCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
            </div>
          </div>
          {goalItems.length === 0 ? (
            <div className="goal-items-list-empty">
              No goal items yet. Search and add items above.
            </div>
          ) : !goalsCollapsed ? (
            <div className="goal-items-list">
              {goalItems.map((item) => {
                const isDisabled = disabledItemIds.has(item.id);
                const isDragging = draggedItemId === item.id;
                const isDropTarget = dropTargetId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`goal-items-list-item ${isDisabled ? 'disabled' : ''} ${isDragging ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item.id)}
                    onDragOver={(e) => handleDragOver(e, item.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, item.id)}
                    onDragEnd={handleDragEnd}
                  >
                    <div
                      className="goal-items-list-item-content"
                      onClick={() => onToggleGoalItem(item.id)}
                      title={isDisabled ? 'Click to enable' : 'Click to disable'}
                    >
                      {item.imageFilename && (
                        <ItemIconWithInfo
                          item={item}
                          itemsMap={itemsMap}
                          className={`goal-items-list-item-icon ${getRarityClass(item.rarity)}`}
                        />
                      )}
                      <span className="goal-items-list-item-name">{item.name.en}</span>
                    </div>
                    <button
                      className="goal-items-list-item-remove"
                      onClick={() => onRemoveGoalItem(item.id)}
                      title="Remove from goals"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <div className="sidebar-section-title">Enough in Stash</div>
            <div className="sidebar-section-actions">
              <span className="sidebar-section-count">{stashItems.length}</span>
              <button
                className="sidebar-section-toggle"
                onClick={() => setStashCollapsed(!stashCollapsed)}
                title={stashCollapsed ? 'Expand stash list' : 'Collapse stash list'}
                disabled={stashItems.length === 0}
              >
                {stashCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
            </div>
          </div>
          {stashItems.length === 0 ? (
            <div className="goal-items-list-empty">
              No items marked as in stash yet.
            </div>
          ) : !stashCollapsed ? (
            <div className="goal-items-list stash-items-list">
              {stashItems.map((item) => {
                const isDisabled = disabledStashItemIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`goal-items-list-item ${isDisabled ? 'disabled' : ''} stash`}
                  >
                    <div
                      className="goal-items-list-item-content"
                      onClick={() => onToggleDisabledStashItem(item.id)}
                      title={isDisabled ? 'Click to enable this stash item' : 'Click to disable this stash item'}
                    >
                      {item.imageFilename && (
                        <ItemIconWithInfo
                          item={item}
                          itemsMap={itemsMap}
                          className={`goal-items-list-item-icon ${getRarityClass(item.rarity)}`}
                        />
                      )}
                      <span className="goal-items-list-item-name">{item.name.en}</span>
                    </div>
                    <div className="goal-items-list-item-actions">
                      <button
                        className="goal-items-list-item-remove"
                        onClick={() => onRemoveStashItem(item.id)}
                        title="Remove from stash"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
    </div>
  );
}
