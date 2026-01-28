import type { Quest } from '../types/quest';

/**
 * Check if quest is available (prerequisites met, not completed)
 */
export function isQuestAvailable(
  quest: Quest,
  completedQuests: Set<string>
): boolean {
  if (completedQuests.has(quest.id)) return false;
  if (quest.previousQuestIds.length === 0) return true;
  return quest.previousQuestIds.every((id) => completedQuests.has(id));
}

/**
 * Get all quests that depend on this quest (recursively)
 */
export function getAllDependents(
  questId: string,
  quests: Quest[],
  completed: Set<string>
): Set<string> {
  const dependents = new Set<string>();
  const toCheck = [questId];

  while (toCheck.length > 0) {
    const current = toCheck.pop()!;
    const quest = quests.find((q) => q.id === current);
    if (quest) {
      quest.nextQuestIds.forEach((nextId) => {
        if (completed.has(nextId) && !dependents.has(nextId)) {
          dependents.add(nextId);
          toCheck.push(nextId);
        }
      });
    }
  }
  return dependents;
}

/**
 * Get all prerequisites recursively
 */
export function getAllPrerequisites(
  questId: string,
  quests: Quest[]
): Set<string> {
  const prerequisites = new Set<string>();
  const toCheck = [questId];

  while (toCheck.length > 0) {
    const current = toCheck.pop()!;
    const quest = quests.find((q) => q.id === current);
    if (quest) {
      quest.previousQuestIds.forEach((prevId) => {
        if (!prerequisites.has(prevId)) {
          prerequisites.add(prevId);
          toCheck.push(prevId);
        }
      });
    }
  }
  return prerequisites;
}
