import type { ItemsMap } from '../types/item';
import type { StoredList } from '../types/list';
import type { QuestDefinition } from '../types/quest';
import { quartermasterStore } from '../../../shared/state/stores';

export function itemKey(questId: string, itemId: string): string {
  return `${questId}:${itemId}`;
}

function isQuestItemEnabled(questId: string, itemId: string, toggles: { itemEnabled: Record<string, boolean> }): boolean {
  const key = itemKey(questId, itemId);
  return toggles.itemEnabled[key] ?? true;
}

export function generateQuestLists(
  questDefs: QuestDefinition[],
  completedQuestIds: Set<string>,
  itemsMap: ItemsMap,
): StoredList[] {
  const toggles = quartermasterStore.get().questToggles;

  const lists: StoredList[] = [];
  for (const q of questDefs) {
    if (completedQuestIds.has(q.id)) continue;

    const filteredItems = q.requiredItems
      .filter(ri => {
        const item = itemsMap[ri.itemId];
        if (!item) return false;
        if (item.questItem === true) return false;
        return true;
      });

    if (filteredItems.length === 0) continue;

    const listId = `quest_${q.id}`;
    lists.push({
      id: listId,
      name: q.name,
      type: 'quest' as const,
      isEnabled: true,
      items: filteredItems.map(ri => ({
        itemId: ri.itemId,
        quantity: ri.quantity,
        isEnabled: isQuestItemEnabled(q.id, ri.itemId, toggles),
      })),
    });
  }

  lists.sort((a, b) => a.name.localeCompare(b.name));
  return lists;
}

export function cleanupObsoleteQuestToggles(
  generatedListIds: Set<string>,
  generatedItemKeys: Set<string>,
): { listEnabled: Record<string, boolean>; itemEnabled: Record<string, boolean> } {
  const toggles = quartermasterStore.get().questToggles;

  const cleanedListEnabled: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(toggles.listEnabled)) {
    if (generatedListIds.has(key)) {
      cleanedListEnabled[key] = value;
    }
  }

  const cleanedItemEnabled: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(toggles.itemEnabled)) {
    if (generatedItemKeys.has(key)) {
      cleanedItemEnabled[key] = value;
    }
  }

  return { listEnabled: cleanedListEnabled, itemEnabled: cleanedItemEnabled };
}
