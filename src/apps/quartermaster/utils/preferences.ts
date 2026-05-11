/**
 * Device-local UI preferences for Quartermaster.
 *
 * These values are intentionally not part of `quartermasterStore`: they
 * describe this browser's current view/layout, not user-authored planning
 * data that should sync across devices.
 */

export type QuartermasterViewId = 'lists' | 'stash' | 'hideout' | 'in-raid' | 'crafting';

const ACTIVE_VIEW_KEY = 'quartermaster.ui.activeView';
const SELECTED_LIST_KEY = 'quartermaster.ui.selectedListId';
const COLLAPSED_HIDEOUT_MODULES_KEY = 'quartermaster.ui.collapsedHideoutModules';
const LEGACY_SELECTED_LIST_KEY = 'quartermaster.selectedListId';

const VALID_VIEWS = new Set<QuartermasterViewId>([
  'lists',
  'stash',
  'hideout',
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
    : 'lists';
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
