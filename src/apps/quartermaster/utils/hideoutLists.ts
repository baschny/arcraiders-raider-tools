/**
 * Hideout List Generation
 * See specification CR-007, CR-009
 */

import type { HideoutModuleDefinition, HideoutToggleState } from '../types/hideout';
import type { CachedHideout } from '../../../shared/types/arctracker';
import type { StoredList } from '../types/list';
import { listKey, itemKey } from './hideoutStorage';

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
    if (!cached) continue;

    for (const levelDef of def.levels) {
      if (levelDef.level <= cached.currentLevel) continue;

      const isNext = levelDef.level === cached.currentLevel + 1;
      const name = options.formatListName(def.name, levelDef.level, isNext);

      const lk = listKey(def.id, levelDef.level);
      const isListEnabled = toggleState.listEnabled[lk] ?? true;

      lists.push({
        id: `hideout_${def.id}_${levelDef.level}`,
        name,
        type: 'hideout',
        isEnabled: isListEnabled,
        items: levelDef.requirementItemIds.map(req => ({
          itemId: req.itemId,
          quantity: req.quantity,
          isEnabled: toggleState.itemEnabled[itemKey(def.id, levelDef.level, req.itemId)] ?? true,
        })),
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
    const aIsNext = moduleMap.get(aModuleId)?.currentLevel === aLevel - 1;
    const bIsNext = moduleMap.get(bModuleId)?.currentLevel === bLevel - 1;

    if (aIsNext !== bIsNext) return aIsNext ? -1 : 1;

    if (aModuleName !== bModuleName) return options.compareText(aModuleName, bModuleName);

    return aLevel - bLevel;
  });

  return lists;
}
