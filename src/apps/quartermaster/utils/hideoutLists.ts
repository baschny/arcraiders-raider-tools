/**
 * Hideout List Generation
 * See specification CR-007, CR-009
 */

import type { HideoutModuleDefinition, HideoutToggleState } from '../types/hideout';
import type { CachedHideout } from '../../../shared/types/arctracker';
import type { StoredList } from '../types/list';
import { listKey, itemKey } from './hideoutStorage';

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
): StoredList[] {
  const moduleMap = new Map(cachedHideout.modules.map(m => [m.moduleId, m]));
  const lists: StoredList[] = [];

  for (const def of definitions) {
    const cached = moduleMap.get(def.id);
    if (!cached) continue;

    for (const levelDef of def.levels) {
      if (levelDef.level <= cached.currentLevel) continue;

      const isNext = levelDef.level === cached.currentLevel + 1;
      const name = isNext
        ? `${def.name} to Level ${levelDef.level} (Next)`
        : `${def.name} to Level ${levelDef.level}`;

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
    const aIsNext = a.name.endsWith('(Next)');
    const bIsNext = b.name.endsWith('(Next)');

    if (aIsNext !== bIsNext) return aIsNext ? -1 : 1;

    // Extract module name and level for sorting
    const aName = a.name.replace(/ to Level \d+.*$/, '');
    const bName = b.name.replace(/ to Level \d+.*$/, '');

    if (aName !== bName) return aName.localeCompare(bName);

    // Extract target level from id: hideout_<moduleId>_<level>
    const aLevel = parseInt(a.id.split('_').pop() ?? '0', 10);
    const bLevel = parseInt(b.id.split('_').pop() ?? '0', 10);
    return aLevel - bLevel;
  });

  return lists;
}
