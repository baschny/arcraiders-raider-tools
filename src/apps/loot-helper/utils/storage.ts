const GOAL_ITEMS_KEY = 'what-to-loot-goal-items';
const DISABLED_ITEMS_KEY = 'what-to-loot-disabled-items';
const STASH_ITEMS_KEY = 'what-to-loot-stash-items';
const DISABLED_STASH_ITEMS_KEY = 'what-to-loot-disabled-stash-items';

export function loadGoalItems(): string[] {
  try {
    const stored = localStorage.getItem(GOAL_ITEMS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load goal items from localStorage:', error);
    return [];
  }
}

export function saveGoalItems(itemIds: string[]): void {
  try {
    localStorage.setItem(GOAL_ITEMS_KEY, JSON.stringify(itemIds));
  } catch (error) {
    console.error('Failed to save goal items to localStorage:', error);
  }
}

export function loadDisabledItems(): Set<string> {
  try {
    const stored = localStorage.getItem(DISABLED_ITEMS_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch (error) {
    console.error('Failed to load disabled items from localStorage:', error);
    return new Set();
  }
}

export function saveDisabledItems(disabledIds: Set<string>): void {
  try {
    localStorage.setItem(DISABLED_ITEMS_KEY, JSON.stringify(Array.from(disabledIds)));
  } catch (error) {
    console.error('Failed to save disabled items to localStorage:', error);
  }
}

export function loadDisabledStashItems(): Set<string> {
  try {
    const stored = localStorage.getItem(DISABLED_STASH_ITEMS_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch (error) {
    console.error('Failed to load disabled stash items from localStorage:', error);
    return new Set();
  }
}

export function saveDisabledStashItems(disabledIds: Set<string>): void {
  try {
    localStorage.setItem(DISABLED_STASH_ITEMS_KEY, JSON.stringify(Array.from(disabledIds)));
  } catch (error) {
    console.error('Failed to save disabled stash items to localStorage:', error);
  }
}

export function addGoalItem(itemId: string): string[] {
  const items = loadGoalItems();
  if (!items.includes(itemId)) {
    items.push(itemId);
    saveGoalItems(items);
  }
  return items;
}

export function removeGoalItem(itemId: string): string[] {
  const items = loadGoalItems();
  const filtered = items.filter((id) => id !== itemId);
  saveGoalItems(filtered);
  return filtered;
}

const ENABLED_TYPES_KEY = 'what-to-loot-enabled-types';

export function loadEnabledTypes(): Set<string> | null {
  try {
    const stored = localStorage.getItem(ENABLED_TYPES_KEY);
    return stored ? new Set(JSON.parse(stored)) : null;
  } catch (error) {
    console.error('Failed to load enabled types from localStorage:', error);
    return null;
  }
}

export function saveEnabledTypes(enabledTypes: Set<string>): void {
  try {
    localStorage.setItem(ENABLED_TYPES_KEY, JSON.stringify(Array.from(enabledTypes)));
  } catch (error) {
    console.error('Failed to save enabled types to localStorage:', error);
  }
}

const ENABLED_RARITIES_KEY = 'what-to-loot-enabled-rarities';

export function loadEnabledRarities(): Set<string> | null {
  try {
    const stored = localStorage.getItem(ENABLED_RARITIES_KEY);
    return stored ? new Set(JSON.parse(stored)) : null;
  } catch (error) {
    console.error('Failed to load enabled rarities from localStorage:', error);
    return null;
  }
}

export function saveEnabledRarities(enabledRarities: Set<string>): void {
  try {
    localStorage.setItem(ENABLED_RARITIES_KEY, JSON.stringify(Array.from(enabledRarities)));
  } catch (error) {
    console.error('Failed to save enabled rarities to localStorage:', error);
  }
}

export function loadStashItems(): Set<string> {
  try {
    const stored = localStorage.getItem(STASH_ITEMS_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch (error) {
    console.error('Failed to load stash items from localStorage:', error);
    return new Set();
  }
}

export function saveStashItems(stashIds: Set<string>): void {
  try {
    localStorage.setItem(STASH_ITEMS_KEY, JSON.stringify(Array.from(stashIds)));
  } catch (error) {
    console.error('Failed to save stash items to localStorage:', error);
  }
}

const ENABLED_LOCATIONS_KEY = 'what-to-loot-enabled-locations';

export function loadEnabledLocations(): Set<string> | null {
  try {
    const stored = localStorage.getItem(ENABLED_LOCATIONS_KEY);
    return stored ? new Set(JSON.parse(stored)) : null;
  } catch (error) {
    console.error('Failed to load enabled locations from localStorage:', error);
    return null;
  }
}

export function saveEnabledLocations(enabledLocations: Set<string>): void {
  try {
    localStorage.setItem(ENABLED_LOCATIONS_KEY, JSON.stringify(Array.from(enabledLocations)));
  } catch (error) {
    console.error('Failed to save enabled locations to localStorage:', error);
  }
}
