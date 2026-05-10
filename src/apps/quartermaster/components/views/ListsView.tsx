/**
 * Lists View Component
 * See specification section 7.4 / CR-006, CR-007
 */

import { useEffect, useState, useMemo } from 'react';
import { Plus, Trash2, Eye, EyeOff, List, RefreshCw, Home } from 'lucide-react';
import type { ItemsMap } from '../../types/item';
import type { StoredList } from '../../types/list';
import type { PlannerResult } from '../../types/planner';
import { ItemIcon } from '../ItemIcon';
import { searchItems } from '../../utils/dataLoader';
import { AuthGate } from '../AuthGate';
import type { ItemInsightsMap } from '../../utils/itemInsights';
import { useLocale } from '../../../../shared/context/LocaleContext';

interface ListsViewProps {
  itemsMap: ItemsMap;
  lists: StoredList[];
  hideoutLists: StoredList[];
  plannerResult: PlannerResult;
  itemInsights: ItemInsightsMap;
  getOwnedQuantity: (itemId: string) => number | null;
  onCreateList: (name: string) => void;
  onDeleteList: (id: string) => void;
  onToggleList: (id: string) => void;
  onRenameList: (id: string, name: string) => void;
  onAddItem: (listId: string, itemId: string, quantity: number) => void;
  onRemoveItem: (listId: string, itemId: string) => void;
  onUpdateQuantity: (listId: string, itemId: string, quantity: number) => void;
  onToggleItem: (listId: string, itemId: string) => void;
  onReorderLists: (reorderedLists: StoredList[]) => void;
  onReorderItems: (listId: string, reorderedItemIds: string[]) => void;
  onSyncHideout: () => void;
  isSyncingHideout: boolean;
  hasHideoutCache: boolean;
  onToggleHideoutList: (moduleId: string, level: number) => void;
  onToggleHideoutItem: (moduleId: string, level: number, itemId: string) => void;
}

const SELECTED_LIST_STORAGE_KEY = 'quartermaster.selectedListId';

/**
 * Parse moduleId and level from a hideout list id: "hideout_<moduleId>_<level>"
 */
function parseHideoutListId(listId: string): { moduleId: string; level: number } | null {
  const match = listId.match(/^hideout_(.+)_(\d+)$/);
  if (!match) return null;
  return { moduleId: match[1], level: parseInt(match[2], 10) };
}

function getStoredSelectedListId(): string | null {
  try {
    return window.localStorage.getItem(SELECTED_LIST_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistSelectedListId(listId: string | null): void {
  try {
    if (listId) {
      window.localStorage.setItem(SELECTED_LIST_STORAGE_KEY, listId);
    } else {
      window.localStorage.removeItem(SELECTED_LIST_STORAGE_KEY);
    }
  } catch {
    // Ignore localStorage failures; selection still works for the current mount.
  }
}

function resolveSelectedListId(
  lists: StoredList[],
  hideoutLists: StoredList[],
  preferredListId: string | null,
): string | null {
  const allLists = [...lists, ...hideoutLists];
  if (preferredListId && allLists.some((list) => list.id === preferredListId)) {
    return preferredListId;
  }
  return allLists[0]?.id ?? null;
}

export function ListsView({
  itemsMap,
  lists,
  hideoutLists,
  plannerResult,
  itemInsights,
  getOwnedQuantity,
  onCreateList,
  onDeleteList,
  onToggleList,
  onRenameList,
  onAddItem,
  onRemoveItem,
  onUpdateQuantity,
  onToggleItem,
  onReorderLists,
  onReorderItems,
  onSyncHideout,
  isSyncingHideout,
  hasHideoutCache,
  onToggleHideoutList,
  onToggleHideoutItem,
}: ListsViewProps) {
  const { t, compareText } = useLocale();
  const [selectedListId, setSelectedListId] = useState<string | null>(
    () => resolveSelectedListId(lists, hideoutLists, getStoredSelectedListId())
  );
  const [newListName, setNewListName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // List DnD state
  const [draggedListId, setDraggedListId] = useState<string | null>(null);
  const [dropTargetListId, setDropTargetListId] = useState<string | null>(null);

  // Item DnD state
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropTargetItemId, setDropTargetItemId] = useState<string | null>(null);

  const selectedList = lists.find(l => l.id === selectedListId)
    ?? hideoutLists.find(l => l.id === selectedListId);
  const isHideoutList = selectedList?.type === 'hideout';
  const tooltipContext = {
    itemsMap,
    plannerResult,
    itemInsights,
  };

  // Search results for autocomplete
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchItems(itemsMap, searchQuery)
      .sort((a, b) => compareText(a.name, b.name))
      .slice(0, 10);
  }, [itemsMap, searchQuery, compareText]);

  useEffect(() => {
    const nextSelectedListId = resolveSelectedListId(
      lists,
      hideoutLists,
      selectedListId ?? getStoredSelectedListId(),
    );

    if (nextSelectedListId !== selectedListId) {
      setSelectedListId(nextSelectedListId);
    }
  }, [lists, hideoutLists, selectedListId]);

  useEffect(() => {
    persistSelectedListId(selectedListId);
  }, [selectedListId]);

  // --- Handlers ---

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    onCreateList(newListName.trim());
    setNewListName('');
  };

  const handleAddItem = (itemId: string) => {
    if (!selectedListId) return;
    const item = itemsMap[itemId];
    const quantity = item?.craftQuantity ?? 1;
    onAddItem(selectedListId, itemId, quantity);
    setSearchQuery('');
    setShowSuggestions(false);
  };

  const handleQuantityChange = (itemId: string, delta: number) => {
    if (!selectedListId || !selectedList) return;
    const listItem = selectedList.items.find(i => i.itemId === itemId);
    if (!listItem) return;

    const item = itemsMap[itemId];
    const step = item?.craftQuantity ?? 1;
    const newQty = Math.max(step, listItem.quantity + delta * step);
    onUpdateQuantity(selectedListId, itemId, newQty);
  };

  // --- List DnD handlers ---

  const handleListDragStart = (e: React.DragEvent, listId: string) => {
    setDraggedListId(listId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleListDragOver = (e: React.DragEvent, targetListId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedListId && draggedListId !== targetListId) {
      setDropTargetListId(targetListId);
    }
  };

  const handleListDragLeave = () => {
    setDropTargetListId(null);
  };

  const handleListDrop = (e: React.DragEvent, targetListId: string) => {
    e.preventDefault();
    if (!draggedListId || draggedListId === targetListId) {
      setDraggedListId(null);
      return;
    }

    const fromIndex = lists.findIndex(l => l.id === draggedListId);
    const toIndex = lists.findIndex(l => l.id === targetListId);

    if (fromIndex === -1 || toIndex === -1) {
      setDraggedListId(null);
      return;
    }

    const reordered = [...lists];
    reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, lists[fromIndex]);

    onReorderLists(reordered);
    setDraggedListId(null);
    setDropTargetListId(null);
  };

  const handleListDragEnd = () => {
    setDraggedListId(null);
    setDropTargetListId(null);
  };

  // --- Item DnD handlers ---

  const handleItemDragStart = (e: React.DragEvent, itemId: string) => {
    setDraggedItemId(itemId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleItemDragOver = (e: React.DragEvent, targetItemId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedItemId && draggedItemId !== targetItemId) {
      setDropTargetItemId(targetItemId);
    }
  };

  const handleItemDragLeave = () => {
    setDropTargetItemId(null);
  };

  const handleItemDrop = (e: React.DragEvent, targetItemId: string) => {
    e.preventDefault();
    if (!draggedItemId || !selectedList || !selectedListId || draggedItemId === targetItemId) {
      setDraggedItemId(null);
      return;
    }

    const itemIds = selectedList.items.map(i => i.itemId);
    const fromIndex = itemIds.indexOf(draggedItemId);
    const toIndex = itemIds.indexOf(targetItemId);

    if (fromIndex === -1 || toIndex === -1) {
      setDraggedItemId(null);
      return;
    }

    const reordered = [...itemIds];
    reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, draggedItemId);

    onReorderItems(selectedListId, reordered);
    setDraggedItemId(null);
    setDropTargetItemId(null);
  };

  const handleItemDragEnd = () => {
    setDraggedItemId(null);
    setDropTargetItemId(null);
  };

    return (
    <div className="lists-view">
      {/* List Panel */}
      <div className="lists-view__list">
        {/* User Lists Section */}
        <div className="lists-view__list-header">
          <span className="lists-view__list-title">{t('quartermaster.lists.userLists')}</span>
        </div>

        <div className="lists-view__items">
          {lists.map(list => (
            <div
              key={list.id}
              draggable
              className={[
                'lists-view__item',
                list.id === selectedListId ? 'lists-view__item--active' : '',
                !list.isEnabled ? 'lists-view__item--disabled' : '',
                list.id === dropTargetListId ? 'lists-view__item--drop-target' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setSelectedListId(list.id)}
              onDragStart={(e) => handleListDragStart(e, list.id)}
              onDragOver={(e) => handleListDragOver(e, list.id)}
              onDragLeave={handleListDragLeave}
              onDrop={(e) => handleListDrop(e, list.id)}
              onDragEnd={handleListDragEnd}
            >
              <span className="lists-view__item-name">{list.name}</span>
              <span
                className="lists-view__item-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleList(list.id);
                }}
              >
                {list.isEnabled ? <Eye size={14} /> : <EyeOff size={14} />}
              </span>
            </div>
          ))}
        </div>

        {/* Hideout Upgrade Lists Section (CR-009) */}
        <div className="lists-view__list-header" style={{ marginTop: 12 }}>
          <span className="lists-view__list-title">
            <Home size={14} /> {t('quartermaster.lists.hideoutUpgrades')}
          </span>
        </div>

        {hasHideoutCache && hideoutLists.length > 0 ? (
          <div className="lists-view__items">
            {hideoutLists.map(list => {
              const parsed = parseHideoutListId(list.id);
              return (
                <div
                  key={list.id}
                  className={[
                    'lists-view__item',
                    'lists-view__item--hideout',
                    list.id === selectedListId ? 'lists-view__item--active' : '',
                    !list.isEnabled ? 'lists-view__item--disabled' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setSelectedListId(list.id)}
                >
                  <span className="lists-view__item-name">{list.name}</span>
                  <span
                    className="lists-view__item-toggle"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (parsed) onToggleHideoutList(parsed.moduleId, parsed.level);
                    }}
                  >
                    {list.isEnabled ? <Eye size={14} /> : <EyeOff size={14} />}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="lists-view__hideout-hint">
            {hasHideoutCache
              ? t('quartermaster.lists.hideoutMaxed')
              : t('quartermaster.lists.syncHideoutHint')}
          </div>
        )}

        <AuthGate>
          <button
            className="qm-button"
            onClick={onSyncHideout}
            disabled={isSyncingHideout}
            style={{ width: '100%', marginTop: 8 }}
          >
            <RefreshCw size={14} className={isSyncingHideout ? 'animate-spin' : ''} />
            {t('quartermaster.common.syncHideouts')}
          </button>
        </AuthGate>

        <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid #444' }}>
          <input
            type="text"
            className="qm-input"
            placeholder={t('quartermaster.lists.newListPlaceholder')}
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateList()}
            style={{ width: '100%', marginBottom: 8 }}
          />
          <button
            className="qm-button qm-button--primary"
            onClick={handleCreateList}
            disabled={!newListName.trim()}
            style={{ width: '100%' }}
          >
            <Plus size={14} /> {t('quartermaster.lists.createList')}
          </button>
        </div>
      </div>

      {/* List Editor */}
      <div className="lists-view__editor">
        {selectedList ? (
          <>
            <div className="lists-view__editor-header">
              {isHideoutList ? (
                <span style={{ fontSize: 14, fontWeight: 600 }}>{selectedList.name}</span>
              ) : (
                <input
                  type="text"
                  className="qm-input"
                  value={selectedList.name}
                  onChange={(e) => onRenameList(selectedList.id, e.target.value)}
                  style={{ fontSize: 14, fontWeight: 600 }}
                />
              )}
              {!isHideoutList && (
                <button
                  className="qm-button"
                  onClick={() => {
                    onDeleteList(selectedList.id);
                    setSelectedListId(lists.find(l => l.id !== selectedList.id)?.id ?? null);
                  }}
                >
                  <Trash2 size={14} /> {t('quartermaster.lists.delete')}
                </button>
              )}
            </div>

            {/* Add Item – user lists only */}
            {!isHideoutList && (
              <div className="lists-view__add-item" style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="qm-input"
                  placeholder={t('quartermaster.lists.searchItemsPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                />
                {showSuggestions && searchResults.length > 0 && (
                  <div className="lists-view__suggestions">
                    {searchResults.map(item => (
                      <button
                        type="button"
                        key={item.id}
                        className="lists-view__suggestion"
                        onClick={() => handleAddItem(item.id)}
                      >
                        <img className="lists-view__suggestion-icon" src={item.icon} alt="" />
                        <span className="lists-view__suggestion-name qm-item-name">{item.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Items */}
            <div className="lists-view__item-list">
              {selectedList.items.map(listItem => {
                const item = itemsMap[listItem.itemId];
                if (!item) return null;

                const parsed = isHideoutList ? parseHideoutListId(selectedList.id) : null;

                return (
                  <div
                    key={listItem.itemId}
                    draggable={!isHideoutList}
                    className={[
                      'lists-view__list-item',
                      !listItem.isEnabled ? 'lists-view__list-item--disabled' : '',
                      !isHideoutList && listItem.itemId === dropTargetItemId ? 'lists-view__list-item--drop-target' : '',
                    ].filter(Boolean).join(' ')}
                    onDragStart={!isHideoutList ? (e) => handleItemDragStart(e, listItem.itemId) : undefined}
                    onDragOver={!isHideoutList ? (e) => handleItemDragOver(e, listItem.itemId) : undefined}
                    onDragLeave={!isHideoutList ? handleItemDragLeave : undefined}
                    onDrop={!isHideoutList ? (e) => handleItemDrop(e, listItem.itemId) : undefined}
                    onDragEnd={!isHideoutList ? handleItemDragEnd : undefined}
                  >
                    <div className="lists-view__row-actions">
                      {isHideoutList ? (
                        <button
                          className="qm-button lists-view__action-button"
                          onClick={() => {
                            if (parsed) onToggleHideoutItem(parsed.moduleId, parsed.level, listItem.itemId);
                          }}
                        >
                          {listItem.isEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                      ) : (
                        <>
                          <button
                            className="qm-button lists-view__action-button lists-view__action-button--danger"
                            onClick={() => onRemoveItem(selectedList.id, listItem.itemId)}
                          >
                            <Trash2 size={16} />
                          </button>
                          <button
                            className="qm-button lists-view__action-button"
                            onClick={() => onToggleItem(selectedList.id, listItem.itemId)}
                          >
                            {listItem.isEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
                          </button>
                        </>
                      )}
                    </div>
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
                    <div className="lists-view__item-main">
                      <span className="lists-view__item-name-label qm-item-name">{item.name}</span>
                      {isHideoutList ? (
                        <span className="lists-view__qty-label">{listItem.quantity}x</span>
                      ) : (
                        <div className="lists-view__item-controls">
                          <button
                            className="qm-button lists-view__step-button"
                            onClick={() => handleQuantityChange(listItem.itemId, -1)}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            className="qm-input lists-view__qty-input"
                            value={listItem.quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val) && val > 0) {
                                onUpdateQuantity(selectedList.id, listItem.itemId, val);
                              }
                            }}
                            min={1}
                          />
                          <button
                            className="qm-button lists-view__step-button"
                            onClick={() => handleQuantityChange(listItem.itemId, 1)}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="qm-empty-state">
            <List size={48} />
            <p>{t('quartermaster.lists.empty')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
