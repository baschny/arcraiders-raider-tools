/**
 * Device-local UI preferences for Quartermaster.
 *
 * These values are intentionally not part of `quartermasterStore`: they
 * describe this browser's current view/layout, not user-authored planning
 * data that should sync across devices.
 */

export type QuartermasterViewId = 'welcome' | 'lists' | 'stash' | 'weapons' | 'hideout' | 'projects' | 'quests' | 'in-raid' | 'crafting';

const ACTIVE_VIEW_KEY = 'quartermaster.ui.activeView';
const SELECTED_LIST_KEY = 'quartermaster.ui.selectedListId';
const COLLAPSED_HIDEOUT_MODULES_KEY = 'quartermaster.ui.collapsedHideoutModules';
const QUEST_SORT_MODE_KEY = 'quartermaster.ui.questSortMode';
const LEGACY_SELECTED_LIST_KEY = 'quartermaster.selectedListId';

const VALID_VIEWS = new Set<QuartermasterViewId>([
  'welcome',
  'lists',
  'stash',
  'weapons',
  'hideout',
  'projects',
  'quests',
  'in-raid',
  'crafting',
]);

function readString(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeString(key: string, value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Preferences are best-effort; the in-memory UI state still works.
  }
}

export function loadActiveView(): QuartermasterViewId {
  const stored = readString(ACTIVE_VIEW_KEY);
  return stored && VALID_VIEWS.has(stored as QuartermasterViewId)
    ? stored as QuartermasterViewId
    : 'welcome';
}

export function saveActiveView(view: QuartermasterViewId): void {
  writeString(ACTIVE_VIEW_KEY, view);
}

export function loadSelectedListId(): string | null {
  return readString(SELECTED_LIST_KEY) ?? readString(LEGACY_SELECTED_LIST_KEY);
}

export function saveSelectedListId(listId: string | null): void {
  writeString(SELECTED_LIST_KEY, listId);
  writeString(LEGACY_SELECTED_LIST_KEY, null);
}

export function loadCollapsedHideoutModules(): Record<string, boolean> {
  const stored = readString(COLLAPSED_HIDEOUT_MODULES_KEY);
  if (!stored) return {};

  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const result: Record<string, boolean> = {};
    for (const [moduleId, collapsed] of Object.entries(parsed)) {
      if (typeof moduleId === 'string' && typeof collapsed === 'boolean') {
        result[moduleId] = collapsed;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function saveCollapsedHideoutModules(collapsedModules: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(
      COLLAPSED_HIDEOUT_MODULES_KEY,
      JSON.stringify(collapsedModules),
    );
  } catch {
    // Preferences are best-effort; the in-memory UI state still works.
  }
}

// ---------------------------------------------------------------------------
// Stash view filter preferences
// ---------------------------------------------------------------------------

export interface StashFilters {
  searchQuery: string;
  categoryFilter: string;
  rarityFilter: string;
  showOnlyUseless: boolean;
}

const STASH_FILTERS_KEY = 'quartermaster.ui.stashFilters';

export function loadStashFilters(): StashFilters {
  const stored = readString(STASH_FILTERS_KEY);
  if (!stored) return { searchQuery: '', categoryFilter: 'all', rarityFilter: 'all', showOnlyUseless: false };

  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { searchQuery: '', categoryFilter: 'all', rarityFilter: 'all', showOnlyUseless: false };
    }

    const obj = parsed as Record<string, unknown>;
    return {
      searchQuery: typeof obj.searchQuery === 'string' ? obj.searchQuery : '',
      categoryFilter: typeof obj.categoryFilter === 'string' ? obj.categoryFilter : 'all',
      rarityFilter: typeof obj.rarityFilter === 'string' ? obj.rarityFilter : 'all',
      showOnlyUseless: typeof obj.showOnlyUseless === 'boolean' ? obj.showOnlyUseless : false,
    };
  } catch {
    return { searchQuery: '', categoryFilter: 'all', rarityFilter: 'all', showOnlyUseless: false };
  }
}

export function saveStashFilters(filters: StashFilters): void {
  try {
    window.localStorage.setItem(STASH_FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // Preferences are best-effort; the in-memory UI state still works.
  }
}

// ---------------------------------------------------------------------------
// In-Raid view filter preferences
// ---------------------------------------------------------------------------

export interface InRaidFilters {
  searchQuery: string;
  selectedTypes: string[];
  selectedRarities: string[];
  selectedLocations: string[];
}

const IN_RAID_FILTERS_KEY = 'quartermaster.ui.inRaidFilters';

export function loadInRaidFilters(): InRaidFilters {
  const stored = readString(IN_RAID_FILTERS_KEY);
  if (!stored) return { searchQuery: '', selectedTypes: [], selectedRarities: [], selectedLocations: [] };

  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { searchQuery: '', selectedTypes: [], selectedRarities: [], selectedLocations: [] };
    }

    const obj = parsed as Record<string, unknown>;
    return {
      searchQuery: typeof obj.searchQuery === 'string' ? obj.searchQuery : '',
      selectedTypes: Array.isArray(obj.selectedTypes) ? obj.selectedTypes.filter((v): v is string => typeof v === 'string') : [],
      selectedRarities: Array.isArray(obj.selectedRarities) ? obj.selectedRarities.filter((v): v is string => typeof v === 'string') : [],
      selectedLocations: Array.isArray(obj.selectedLocations) ? obj.selectedLocations.filter((v): v is string => typeof v === 'string') : [],
    };
  } catch {
    return { searchQuery: '', selectedTypes: [], selectedRarities: [], selectedLocations: [] };
  }
}

export function saveInRaidFilters(filters: InRaidFilters): void {
  try {
    window.localStorage.setItem(IN_RAID_FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // Preferences are best-effort; the in-memory UI state still works.
  }
}

export type QuestSortMode = 'alphabetical' | 'next-quests';

export function loadQuestSortMode(): QuestSortMode {
  const stored = readString(QUEST_SORT_MODE_KEY);
  return stored === 'next-quests' ? 'next-quests' : 'alphabetical';
}

export function saveQuestSortMode(mode: QuestSortMode): void {
  writeString(QUEST_SORT_MODE_KEY, mode);
}
