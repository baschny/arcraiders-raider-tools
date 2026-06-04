/**
 * Hideout List Generation
 * See specification CR-007, CR-009
 */

import type { HideoutModuleDefinition, HideoutToggleState } from '../types/hideout';
import type { CachedHideout } from '../../../shared/types/arctracker';
import type { StoredList } from '../types/list';
import { itemKey } from './hideoutStorage';

interface HideoutListLocalizationOptions {
  formatListName: (moduleName: string, level: number, isNext: boolean) => string;
  compareText: (left: string, right: string) => number;
}

/**
 * Generate hideout upgrade lists from static definitions and cached hideout state.
 *
 * - One list per target level above currentLevel
 * - Non-cumulative (each list contains only requirements for that specific level)
 * - Naming: "<name> to Level <N> (Next)" for currentLevel + 1, else "<name> to Level <N>"
 * - Lists are read-only: type = 'hideout'
 */
export function generateHideoutLists(
  definitions: HideoutModuleDefinition[],
  cachedHideout: CachedHideout,
  toggleState: HideoutToggleState,
  options: HideoutListLocalizationOptions,
): StoredList[] {
  const moduleMap = new Map(cachedHideout.modules.map(m => [m.moduleId, m]));
  const definitionMap = new Map(definitions.map((definition) => [definition.id, definition]));
  const lists: StoredList[] = [];

  for (const def of definitions) {
    const cached = moduleMap.get(def.id);
    const currentLevel = cached?.currentLevel ?? 0;

    for (const levelDef of def.levels) {
      if (levelDef.level <= currentLevel) continue;

      const isNext = levelDef.level === currentLevel + 1;
      const name = options.formatListName(def.name, levelDef.level, isNext);

      const items = levelDef.requirementItemIds.map(req => ({
        itemId: req.itemId,
        quantity: req.quantity,
        isEnabled: toggleState.itemEnabled[itemKey(def.id, levelDef.level, req.itemId)] ?? true,
      }));
      const isListEnabled = items.some(item => item.isEnabled);

      lists.push({
        id: `hideout_${def.id}_${levelDef.level}`,
        name,
        type: 'hideout',
        isEnabled: isListEnabled,
        items,
      });
    }
  }

  // Sort per CR-009:
  // 1. All (Next) lists first
  // 2. Remaining future levels
  // 3. Within each group: bench name ASC, then target level ASC
  lists.sort((a, b) => {
    const aIdParts = a.id.match(/^hideout_(.+)_(\d+)$/);
    const bIdParts = b.id.match(/^hideout_(.+)_(\d+)$/);
    const aModuleId = aIdParts?.[1] ?? '';
    const bModuleId = bIdParts?.[1] ?? '';
    const aLevel = parseInt(aIdParts?.[2] ?? '0', 10);
    const bLevel = parseInt(bIdParts?.[2] ?? '0', 10);
    const aModuleName = definitionMap.get(aModuleId)?.name ?? a.name;
    const bModuleName = definitionMap.get(bModuleId)?.name ?? b.name;
    const aCurrentLevel = moduleMap.get(aModuleId)?.currentLevel ?? 0;
    const bCurrentLevel = moduleMap.get(bModuleId)?.currentLevel ?? 0;
    const aIsNext = aCurrentLevel === aLevel - 1;
    const bIsNext = bCurrentLevel === bLevel - 1;

    if (aIsNext !== bIsNext) return aIsNext ? -1 : 1;

    if (aModuleName !== bModuleName) return options.compareText(aModuleName, bModuleName);

    return aLevel - bLevel;
  });

  return lists;
}
