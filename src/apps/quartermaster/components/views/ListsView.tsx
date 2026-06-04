/**
 * Lists View Component
 * See specification section 7.4 / CR-006, CR-007
 */

import { useEffect, useState, useMemo, useRef } from 'react';
import { Plus, Trash2, Eye, EyeOff, List, Pencil, Check, X } from 'lucide-react';
import type { ItemsMap } from '../../types/item';
import type { StoredList } from '../../types/list';
import type { PlannerResult } from '../../types/planner';
import { ItemIcon } from '../ItemIcon';
import { ItemIcon as SharedItemIcon } from '../../../../shared/components/ItemIcon';
import { searchItems } from '../../utils/dataLoader';
import type { ItemInsightsMap } from '../../utils/itemInsights';
import { loadSelectedListId, saveSelectedListId } from '../../utils/preferences';
import { useLocale } from '../../../../shared/context/LocaleContext';

interface ListsViewProps {
  itemsMap: ItemsMap;
  lists: StoredList[];
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
}

function resolveSelectedListId(
  lists: StoredList[],
  preferredListId: string | null,
): string | null {
  if (preferredListId && lists.some((list) => list.id === preferredListId)) {
    return preferredListId;
  }
  return lists[0]?.id ?? null;
}

export function ListsView({
  itemsMap,
  lists,
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
}: ListsViewProps) {
  const { t, tm, compareText } = useLocale();
  const [selectedListId, setSelectedListId] = useState<string | null>(
    () => resolveSelectedListId(lists, loadSelectedListId())
  );
  const [newListName, setNewListName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Edit title state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  // Confirmation dialog state
  const [confirmDeleteListId, setConfirmDeleteListId] = useState<string | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<{ listId: string; itemId: string; name: string } | null>(null);

  const [inputValueMap, setInputValueMap] = useState<Record<string, string>>({});

  // List DnD state
  const [draggedListId, setDraggedListId] = useState<string | null>(null);
  const [dropTargetListId, setDropTargetListId] = useState<string | null>(null);

  // Item DnD state
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropTargetItemId, setDropTargetItemId] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);

  const selectedList = lists.find(l => l.id === selectedListId);
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

  const handleSelectList = (listId: string | null) => {
    setSelectedListId(listId);
    setIsEditingTitle(false);
  };

  useEffect(() => {
    const nextSelectedListId = resolveSelectedListId(
      lists,
      selectedListId ?? loadSelectedListId(),
    );

    if (nextSelectedListId !== selectedListId) {
      // Use setTimeout to avoid synchronous setState during render/effect which triggers lint
      const timer = setTimeout(() => {
        setSelectedListId(nextSelectedListId);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [lists]);

  useEffect(() => {
    saveSelectedListId(selectedListId);
  }, [selectedListId]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // --- Handlers ---

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    onCreateList(newListName.trim());
    setNewListName('');
  };

  const handleDeleteList = (listId: string) => {
    const list = lists.find(l => l.id === listId);
    if (!list) return;

    if (list.items.length === 0) {
      performDeleteList(listId);
    } else {
      setConfirmDeleteListId(listId);
    }
  };

  const performDeleteList = (listId: string) => {
    onDeleteList(listId);
    if (selectedListId === listId) {
      handleSelectList(lists.find(l => l.id !== listId)?.id ?? null);
    }
    setConfirmDeleteListId(null);
  };

  const handleStartEditTitle = () => {
    if (!selectedList) return;
    setEditedTitle(selectedList.name);
    setIsEditingTitle(true);
  };

  const handleSaveTitle = () => {
    if (!selectedListId || !editedTitle.trim()) {
      setIsEditingTitle(false);
      return;
    }
    onRenameList(selectedListId, editedTitle.trim());
    setIsEditingTitle(false);
  };

  const handleRemoveItem = (listId: string, itemId: string) => {
    const item = itemsMap[itemId];
    setConfirmDeleteItem({ listId, itemId, name: item?.name ?? itemId });
  };

  const performRemoveItem = () => {
    if (confirmDeleteItem) {
      onRemoveItem(confirmDeleteItem.listId, confirmDeleteItem.itemId);
      setConfirmDeleteItem(null);
    }
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
              onClick={() => handleSelectList(list.id)}
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
              {isEditingTitle ? (
                <div className="lists-view__title-edit">
                  <input
                    ref={titleInputRef}
                    type="text"
                    className="qm-input"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') setIsEditingTitle(false);
                    }}
                    style={{ fontSize: 14, fontWeight: 600, flex: 1 }}
                  />
                  <button
                    className="qm-button qm-button--primary"
                    onClick={handleSaveTitle}
                    title={t('quartermaster.lists.saveTitleTooltip')}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    className="qm-button"
                    onClick={() => setIsEditingTitle(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="lists-view__title-display">
                  <h2 className="lists-view__editor-title">{selectedList.name}</h2>
                  <button
                    className="qm-button qm-button--icon"
                    onClick={handleStartEditTitle}
                    title={t('quartermaster.lists.editTitleTooltip')}
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              )}
              <button
                className="qm-button qm-button--danger-outline"
                onClick={() => handleDeleteList(selectedList.id)}
              >
                <Trash2 size={14} /> {t('quartermaster.lists.delete')}
              </button>
            </div>

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
                      <SharedItemIcon itemId={item.id} name={item.name} icon={item.icon} rarity={item.rarity} showName={false} className="lists-view__suggestion-icon" />
                      <span className="lists-view__suggestion-name qm-item-name">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Items */}
            <div className="lists-view__item-list">
              {selectedList.items.map(listItem => {
                const item = itemsMap[listItem.itemId];
                if (!item) return null;

                return (
                  <div
                    key={listItem.itemId}
                    draggable
                    className={[
                      'lists-view__list-item',
                      !listItem.isEnabled ? 'lists-view__list-item--disabled' : '',
                      listItem.itemId === dropTargetItemId ? 'lists-view__list-item--drop-target' : '',
                    ].filter(Boolean).join(' ')}
                    onDragStart={(e) => handleItemDragStart(e, listItem.itemId)}
                    onDragOver={(e) => handleItemDragOver(e, listItem.itemId)}
                    onDragLeave={handleItemDragLeave}
                    onDrop={(e) => handleItemDrop(e, listItem.itemId)}
                    onDragEnd={handleItemDragEnd}
                  >
                    <div className="lists-view__row-actions">
                      <button
                        className="qm-button lists-view__action-button"
                        onClick={() => onToggleItem(selectedList.id, listItem.itemId)}
                      >
                        {listItem.isEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
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
                      <div className="lists-view__item-controls">
                        <button
                          className="qm-button lists-view__step-button"
                          onClick={() => handleQuantityChange(listItem.itemId, -1)}
                        >
                          -
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="qm-input lists-view__qty-input"
                          value={inputValueMap[listItem.itemId] ?? listItem.quantity}
                          onChange={(e) => {
                            const rawValue = e.target.value;
                            // Allow digits only
                            if (/^\d*$/.test(rawValue)) {
                              setInputValueMap(prev => ({ ...prev, [listItem.itemId]: rawValue }));
                              const val = parseInt(rawValue, 10);
                              if (!isNaN(val) && val > 0) {
                                onUpdateQuantity(selectedList.id, listItem.itemId, val);
                              }
                            }
                          }}
                          onBlur={() => {
                            // On blur, clear the local override so it reconciles with prop
                            setInputValueMap(prev => {
                              const next = { ...prev };
                              delete next[listItem.itemId];
                              return next;
                            });
                          }}
                        />
                        <button
                          className="qm-button lists-view__step-button"
                          onClick={() => handleQuantityChange(listItem.itemId, 1)}
                        >
                          +
                        </button>
                        <button
                          className="qm-button lists-view__action-button lists-view__action-button--danger lists-view__delete-item"
                          onClick={() => handleRemoveItem(selectedList.id, listItem.itemId)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
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
      {/* Confirmation Dialogs */}
      {confirmDeleteListId && (
        <div className="confirm-overlay" onClick={() => setConfirmDeleteListId(null)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <h3 className="confirm-dialog__title">{t('quartermaster.lists.deleteListConfirmTitle')}</h3>
            <p className="confirm-dialog__body">
              {tm('quartermaster.lists.deleteListConfirmBody', {
                name: lists.find(l => l.id === confirmDeleteListId)?.name ?? ''
              })}
            </p>
            <div className="confirm-dialog__actions">
              <button className="qm-button" onClick={() => setConfirmDeleteListId(null)}>
                {t('quartermaster.lists.cancel')}
              </button>
              <button
                className="qm-button qm-button--danger"
                onClick={() => performDeleteList(confirmDeleteListId)}
                autoFocus
              >
                {t('quartermaster.lists.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteItem && (
        <div className="confirm-overlay" onClick={() => setConfirmDeleteItem(null)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <h3 className="confirm-dialog__title">{t('quartermaster.lists.deleteItemConfirmTitle')}</h3>
            <p className="confirm-dialog__body">
              {tm('quartermaster.lists.deleteItemConfirmBody', { name: confirmDeleteItem.name })}
            </p>
            <div className="confirm-dialog__actions">
              <button className="qm-button" onClick={() => setConfirmDeleteItem(null)}>
                {t('quartermaster.lists.cancel')}
              </button>
              <button
                className="qm-button qm-button--danger"
                onClick={performRemoveItem}
                autoFocus
              >
                {t('quartermaster.lists.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
