/**
 * In Raid View Component
 * See specification section 7.5, change-04 CR-008/CR-009
 */
import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Target, Inbox, Wrench, Recycle, Star, X, Search, ChevronDown } from 'lucide-react';
import type { ItemsMap, ItemRarity } from '../../types/item';
import type { InRaidSuggestion, PlannerResult } from '../../types/planner';
import type { ItemInsightsMap } from '../../utils/itemInsights';
import { ItemIcon } from '../ItemIcon';
import { usePrioritizedItems } from '../../hooks/usePrioritizedItems';
import { useLocale } from '../../../../shared/context/LocaleContext';
import {
  getLocalizedQuartermasterCategory,
  getLocalizedQuartermasterRarity,
  getLocalizedQuartermasterLocation,
} from '../../utils/localization';
import { loadInRaidFilters, saveInRaidFilters, type InRaidFilters } from '../../utils/preferences';

interface InRaidViewProps {
  itemsMap: ItemsMap;
  plannerResult: PlannerResult;
  itemInsights: ItemInsightsMap;
  getOwnedQuantity: (itemId: string) => number | null;
}

type ActionKind = 'keep' | 'recycle' | 'salvage';
type SectionTag = 'prioritized' | 'directTargets' | 'craftSupport' | 'craftableIngredients';

interface SectionItem {
  suggestion: InRaidSuggestion;
  section: SectionTag;
}

interface FilterOption {
  value: string;
  label: string;
  count: number;
}

function resolveActionKind(suggestion: InRaidSuggestion): ActionKind {
  if (suggestion.reasons.includes('BRING_HOME_FINAL_TARGET')) return 'keep';
  if (suggestion.badge === 'CAN_SALVAGE') return 'salvage';
  if (suggestion.reasons.includes('BRING_HOME_FOR_RECYCLE_YIELD')) return 'recycle';
  return 'keep';
}

// --- MultiSelectDropdown ---

interface MultiSelectDropdownProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  isOpen: boolean;
  onToggle: () => void;
}

function MultiSelectDropdown({ label, options, selected, onChange, isOpen, onToggle }: MultiSelectDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onToggle();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onToggle]);

  const isAll = selected.length === 0;
  const handleItemChange = useCallback(
    (value: string) => {
      if (isAll) {
        onChange([value]);
      } else if (selected.includes(value)) {
        const next = selected.filter((v) => v !== value);
        onChange(next);
      } else {
        onChange([...selected, value]);
      }
    },
    [isAll, selected, onChange],
  );

  return (
    <div className="in-raid-view__dropdown" ref={ref}>
      <button
        type="button"
        className={[
          'in-raid-view__dropdown-trigger',
          isOpen ? 'in-raid-view__dropdown-trigger--open' : '',
          selected.length > 0 ? 'in-raid-view__dropdown-trigger--active' : '',
        ].filter(Boolean).join(' ')}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="in-raid-view__dropdown-label">{label}</span>
        {selected.length > 0 && (
          <span className="in-raid-view__dropdown-count">{selected.length}</span>
        )}
        <ChevronDown
          size={14}
          className={isOpen ? 'in-raid-view__dropdown-chevron--open' : ''}
        />
      </button>
      {isOpen && (
        <div className="in-raid-view__dropdown-menu" role="listbox">
          {options.map((opt) => (
            <label key={opt.value} className="in-raid-view__dropdown-item">
              <input
                type="checkbox"
                className="in-raid-view__dropdown-checkbox"
                checked={isAll || selected.includes(opt.value)}
                onChange={() => handleItemChange(opt.value)}
              />
              <span className="in-raid-view__dropdown-item-label">{opt.label}</span>
              <span className="in-raid-view__dropdown-item-count">{opt.count}</span>
            </label>
          ))}
          {options.length === 0 && (
            <div className="in-raid-view__dropdown-empty">—</div>
          )}
        </div>
      )}
    </div>
  );
}

// --- InRaidView ---

export function InRaidView({
  itemsMap,
  plannerResult,
  itemInsights,
  getOwnedQuantity,
}: InRaidViewProps) {
  const { t, tm, compareText } = useLocale();
  const { prioritizedSet, clearAllPrioritized } = usePrioritizedItems();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [filters, setFilters] = useState<InRaidFilters>(() => loadInRaidFilters());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const suggestions = plannerResult.inRaidSuggestions.items;
  const tooltipContext = {
    itemsMap,
    plannerResult,
    itemInsights,
  };

  // Auto-focus search bar when entering the view
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Persist filters to localStorage
  useEffect(() => {
    saveInRaidFilters(filters);
  }, [filters]);

  // Synthetic prioritized items that the planner did not suggest
  const syntheticPrioritized: InRaidSuggestion[] = useMemo(() => {
    const seenIds = new Set(suggestions.map((s) => s.itemId));
    const result: InRaidSuggestion[] = [];
    for (const itemId of prioritizedSet) {
      if (seenIds.has(itemId)) continue;
      const item = itemsMap[itemId];
      if (!item) continue;
      result.push({
        itemId,
        reasons: [],
        badge: 'BRING_HOME',
        impactedTargetItemIds: [],
      });
    }
    return result.sort((a, b) => a.itemId.localeCompare(b.itemId));
  }, [suggestions, prioritizedSet, itemsMap]);

  // Merge all items with section tags
  const mergedItems: SectionItem[] = useMemo(() => {
    const result: SectionItem[] = [];

    for (const s of syntheticPrioritized) {
      result.push({ suggestion: s, section: 'prioritized' });
    }

    for (const s of suggestions) {
      if (prioritizedSet.has(s.itemId)) {
        result.push({ suggestion: s, section: 'prioritized' });
      } else if (s.reasons.includes('BRING_HOME_FINAL_TARGET')) {
        result.push({ suggestion: s, section: 'directTargets' });
      } else if (s.reasons.includes('CRAFTING_INGREDIENT_FOR_DEFICIT') && s.reasons.length === 1) {
        result.push({ suggestion: s, section: 'craftableIngredients' });
      } else {
        result.push({ suggestion: s, section: 'craftSupport' });
      }
    }

    return result;
  }, [suggestions, prioritizedSet, syntheticPrioritized]);

  // Items filtered by search only (used for computing available filter option counts)
  const searchFilteredItems = useMemo(() => {
    if (!filters.searchQuery.trim()) return mergedItems;
    const q = filters.searchQuery.toLowerCase();
    return mergedItems.filter((si) => {
      const item = itemsMap[si.suggestion.itemId];
      return item && item.name.toLowerCase().includes(q);
    });
  }, [mergedItems, filters.searchQuery, itemsMap]);

  // Compute counts for a filter category, excluding that category's own filter
  const computeFilterOptions = useCallback(
    (
      items: SectionItem[],
      category: 'type' | 'rarity' | 'location',
    ): FilterOption[] => {
      const counts = new Map<string, number>();

      for (const si of items) {
        const item = itemsMap[si.suggestion.itemId];
        if (!item) continue;

        // Apply OTHER active filters but not this one
        if (category !== 'rarity' && filters.selectedRarities.length > 0 && !filters.selectedRarities.includes(item.rarity)) continue;
        if (category !== 'type' && filters.selectedTypes.length > 0 && !filters.selectedTypes.includes(item.category)) continue;
        if (category !== 'location' && filters.selectedLocations.length > 0) {
          const locs = item.foundIn ?? [];
          if (!locs.some((loc) => filters.selectedLocations.includes(loc))) continue;
        }

        if (category === 'type') {
          counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
        } else if (category === 'rarity') {
          counts.set(item.rarity, (counts.get(item.rarity) ?? 0) + 1);
        } else {
          const locs = item.foundIn ?? [];
          for (const loc of locs) {
            counts.set(loc, (counts.get(loc) ?? 0) + 1);
          }
        }
      }

      let entries = Array.from(counts.entries());
      if (category === 'type') {
        entries.sort((a, b) =>
          compareText(getLocalizedQuartermasterCategory(t, a[0]), getLocalizedQuartermasterCategory(t, b[0])),
        );
      } else if (category === 'rarity') {
        const order = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
        entries.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
      } else {
        entries.sort((a, b) =>
          compareText(getLocalizedQuartermasterLocation(t, a[0]), getLocalizedQuartermasterLocation(t, b[0])),
        );
      }

      return entries.map(([value, count]) => ({
        value,
        count,
        label:
          category === 'type'
            ? getLocalizedQuartermasterCategory(t, value)
            : category === 'rarity'
              ? getLocalizedQuartermasterRarity(t, value as ItemRarity)
              : getLocalizedQuartermasterLocation(t, value),
      }));
    },
    [itemsMap, filters.selectedRarities, filters.selectedTypes, filters.selectedLocations, compareText, t],
  );

  const typeOptions = useMemo(() => computeFilterOptions(searchFilteredItems, 'type'), [computeFilterOptions, searchFilteredItems]);
  const rarityOptions = useMemo(() => computeFilterOptions(searchFilteredItems, 'rarity'), [computeFilterOptions, searchFilteredItems]);
  const locationOptions = useMemo(() => computeFilterOptions(searchFilteredItems, 'location'), [computeFilterOptions, searchFilteredItems]);

  // Apply all filters
  const filteredSectionItems = useMemo(() => {
    return searchFilteredItems.filter((si) => {
      const item = itemsMap[si.suggestion.itemId];
      if (!item) return false;

      if (filters.selectedTypes.length > 0 && !filters.selectedTypes.includes(item.category)) return false;
      if (filters.selectedRarities.length > 0 && !filters.selectedRarities.includes(item.rarity)) return false;
      if (filters.selectedLocations.length > 0) {
        const locs = item.foundIn ?? [];
        if (!locs.some((loc) => filters.selectedLocations.includes(loc))) return false;
      }

      return true;
    });
  }, [searchFilteredItems, itemsMap, filters]);

  // Split filtered items into sections, sorted alphabetically within each
  const sections = useMemo(() => {
    const result: Record<SectionTag, InRaidSuggestion[]> = {
      prioritized: [],
      directTargets: [],
      craftSupport: [],
      craftableIngredients: [],
    };

    for (const si of filteredSectionItems) {
      result[si.section].push(si.suggestion);
    }

    for (const key of Object.keys(result) as SectionTag[]) {
      result[key].sort((a, b) => {
        const nameA = itemsMap[a.itemId]?.name ?? '';
        const nameB = itemsMap[b.itemId]?.name ?? '';
        return compareText(nameA, nameB);
      });
    }

    return result;
  }, [filteredSectionItems, itemsMap, compareText]);

  // --- Render helpers ---

  const getActionTooltipText = (actionKind: ActionKind): string => {
    switch (actionKind) {
      case 'keep':
        return t('quartermaster.inRaid.keepTooltip');
      case 'salvage':
        return t('quartermaster.inRaid.salvageTooltip');
      case 'recycle':
        return t('quartermaster.inRaid.recycleTooltip');
    }
  };

  const renderCompactCard = (suggestion: InRaidSuggestion, isFirstOfLetter: boolean) => {
    const item = itemsMap[suggestion.itemId];
    if (!item) return null;

    const deficit = plannerResult.deficit[suggestion.itemId] ?? 0;
    const required = plannerResult.required[suggestion.itemId] ?? 0;
    const actionKind = resolveActionKind(suggestion);
    const hasReasons = suggestion.reasons.length > 0;
    const firstLetter = item.name.charAt(0).toUpperCase();

    return (
      <div key={suggestion.itemId} className="in-raid-view__item">
        {isFirstOfLetter && (
          <span className="in-raid-view__item-letter">{firstLetter}</span>
        )}
        <div className="in-raid-view__item-icon-wrapper">
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
          {deficit > 0 && (
            <span
              className="in-raid-view__item-missing-badge"
              title={tm('quartermaster.inRaid.missingTooltip', { deficit, required })}
            >
              {deficit}
            </span>
          )}
        </div>
        <span className="in-raid-view__item-name qm-item-name">{item.name}</span>
        {hasReasons && (
          <span
            className={`in-raid-view__item-action in-raid-view__item-action--${actionKind}`}
            title={getActionTooltipText(actionKind)}
          >
            {actionKind === 'keep' && <Inbox size={14} strokeWidth={2} />}
            {actionKind === 'recycle' && <Recycle size={14} strokeWidth={2} />}
            {actionKind === 'salvage' && <Wrench size={14} strokeWidth={2} />}
          </span>
        )}
      </div>
    );
  };

  const renderSectionItems = (items: InRaidSuggestion[]) => {
    if (items.length === 0) return null;

    let lastLetter = '';
    return (
      <>
        {items.map((s) => {
          const name = itemsMap[s.itemId]?.name ?? '';
          const letter = name.charAt(0).toUpperCase();
          const isFirstOfLetter = items.length > 12 && letter !== lastLetter;
          lastLetter = letter;
          return renderCompactCard(s, isFirstOfLetter);
        })}
      </>
    );
  };

  const handleClearAll = () => {
    clearAllPrioritized();
    setShowClearConfirm(false);
  };

  const hasAnyItems = Object.values(sections).some((items) => items.length > 0);
  const hasActiveFilters =
    filters.searchQuery.trim() !== '' ||
    filters.selectedTypes.length > 0 ||
    filters.selectedRarities.length > 0 ||
    filters.selectedLocations.length > 0;

  const handleClearFilters = () => {
    setFilters({ searchQuery: '', selectedTypes: [], selectedRarities: [], selectedLocations: [] });
    searchInputRef.current?.focus();
  };

  if (suggestions.length === 0 && syntheticPrioritized.length === 0) {
    return (
      <div className="in-raid-view">
        <div className="qm-empty-state">
          <Target size={48} />
          <p>{t('quartermaster.inRaid.empty')}</p>
        </div>
      </div>
    );
  }

  const dropdownToggle = (id: string) => {
    setOpenDropdownId((prev) => (prev === id ? null : id));
  };

  return (
    <>
      {showClearConfirm && (
        <div className="qm-modal-backdrop" role="presentation" onClick={() => setShowClearConfirm(false)}>
          <div
            className="qm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{t('quartermaster.inRaid.prioritizeClearAllTitle')}</h3>
            <p>{t('quartermaster.inRaid.prioritizeClearAllBody')}</p>
            <div className="qm-modal__actions">
              <button
                type="button"
                className="qm-button qm-button--danger"
                onClick={handleClearAll}
              >
                {t('quartermaster.inRaid.prioritizeClearAllConfirm')}
              </button>
              <button
                type="button"
                className="qm-button"
                onClick={() => setShowClearConfirm(false)}
              >
                {t('quartermaster.lists.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="in-raid-view">
        {/* --- Filter Bar --- */}
        <div className="in-raid-view__filters">
          <div className="in-raid-view__search">
            <Search size={16} className="in-raid-view__search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="in-raid-view__search-input"
              placeholder={t('quartermaster.inRaid.searchPlaceholder')}
              value={filters.searchQuery}
              onChange={(e) => setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
            />
            {filters.searchQuery && (
              <button
                type="button"
                className="in-raid-view__search-clear"
                onClick={() => setFilters((prev) => ({ ...prev, searchQuery: '' }))}
                aria-label={t('quartermaster.lists.cancel')}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <MultiSelectDropdown
            label={t('quartermaster.inRaid.filterType')}
            options={typeOptions}
            selected={filters.selectedTypes}
            onChange={(selected) => setFilters((prev) => ({ ...prev, selectedTypes: selected }))}
            isOpen={openDropdownId === 'type'}
            onToggle={() => dropdownToggle('type')}
          />

          <MultiSelectDropdown
            label={t('quartermaster.inRaid.filterRarity')}
            options={rarityOptions}
            selected={filters.selectedRarities}
            onChange={(selected) => setFilters((prev) => ({ ...prev, selectedRarities: selected }))}
            isOpen={openDropdownId === 'rarity'}
            onToggle={() => dropdownToggle('rarity')}
          />

          <MultiSelectDropdown
            label={t('quartermaster.inRaid.filterLocation')}
            options={locationOptions}
            selected={filters.selectedLocations}
            onChange={(selected) => setFilters((prev) => ({ ...prev, selectedLocations: selected }))}
            isOpen={openDropdownId === 'location'}
            onToggle={() => dropdownToggle('location')}
          />

          {hasActiveFilters && (
            <button
              type="button"
              className="in-raid-view__clear-filters"
              onClick={handleClearFilters}
              title={t('quartermaster.inRaid.clearFilters')}
              aria-label={t('quartermaster.inRaid.clearFilters')}
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* --- Section: Priority Targets --- */}
        {sections.prioritized.length > 0 && (
          <section className="in-raid-view__section in-raid-view__section--prioritized">
            <div className="in-raid-view__section-header">
              <h3 className="in-raid-view__section-title">
                <Star size={18} fill="currentColor" strokeWidth={1.5} />
                {t('quartermaster.inRaid.priorityTargets')}
              </h3>
              <button
                type="button"
                className="in-raid-view__clear-all"
                onClick={() => setShowClearConfirm(true)}
                title={t('quartermaster.inRaid.prioritizeClearAll')}
                aria-label={t('quartermaster.inRaid.prioritizeClearAll')}
              >
                <X size={14} strokeWidth={2} />
                {t('quartermaster.inRaid.prioritizeClearAll')}
              </button>
            </div>
            <div className="in-raid-view__grid">
              {renderSectionItems(sections.prioritized)}
            </div>
          </section>
        )}

        {/* --- Section: Direct Targets --- */}
        {sections.directTargets.length > 0 && (
          <section className="in-raid-view__section">
            <h3 className="in-raid-view__section-title">{t('quartermaster.inRaid.directTargets')}</h3>
            <div className="in-raid-view__grid">
              {renderSectionItems(sections.directTargets)}
            </div>
          </section>
        )}

        {/* --- Section: Crafting Materials --- */}
        {sections.craftSupport.length > 0 && (
          <section className="in-raid-view__section">
            <h3 className="in-raid-view__section-title">{t('quartermaster.inRaid.craftingMaterials')}</h3>
            <div className="in-raid-view__grid">
              {renderSectionItems(sections.craftSupport)}
            </div>
          </section>
        )}

        {/* --- Section: Craftable Materials --- */}
        {sections.craftableIngredients.length > 0 && (
          <section className="in-raid-view__section">
            <h3 className="in-raid-view__section-title">{t('quartermaster.inRaid.craftableMaterials')}</h3>
            <div className="in-raid-view__grid">
              {renderSectionItems(sections.craftableIngredients)}
            </div>
          </section>
        )}

        {/* --- No filter results --- */}
        {hasAnyItems === false && (
          <div className="in-raid-view__no-results">
            <p>{t('quartermaster.inRaid.noFilterResults')}</p>
          </div>
        )}
      </div>
    </>
  );
}
