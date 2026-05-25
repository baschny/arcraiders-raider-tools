import type { Quest } from '../types/quest';
import { isQuestAvailable } from './questHelpers';
import type {
  LinkedQuestEntry,
  LinkedQuestSnapshot,
  LinkedQuestState,
} from '../../../shared/types/linkedQuests';

export type QuestDisplayStatus =
  | 'completed'
  | 'active'
  | 'available'
  | 'locked'
  | 'unknown';

export function buildLinkedCompletedQuestSet(
  quests: Quest[],
  snapshot: LinkedQuestSnapshot | null,
): Set<string> {
  const completed = new Set<string>();
  if (!snapshot) return completed;

  for (const quest of quests) {
    if (quest.trader === 'Map') {
      if (isMapNodeUnlockedInLinkedMode(quest, quests, snapshot)) {
        completed.add(quest.id);
      }
      continue;
    }

    const entry = snapshot.questsById[quest.id];
    if (entry?.completed) {
      completed.add(quest.id);
    }
  }

  return completed;
}

export function getQuestDisplayStatus(args: {
  quest: Quest;
  linkedSnapshot: LinkedQuestSnapshot | null;
  linkedCompletedQuests: Set<string>;
}): QuestDisplayStatus {
  const { quest, linkedSnapshot, linkedCompletedQuests } = args;

  if (linkedCompletedQuests.has(quest.id)) return 'completed';

  if (linkedSnapshot?.source === 'embark') {
    const state = linkedSnapshot.questsById[quest.id]?.state;
    if (state === 'active') return 'active';
    if (state === 'locked') return 'locked';
    if (state === 'unknown') return 'unknown';
  }

  return isQuestAvailable(quest, linkedCompletedQuests) ? 'available' : 'locked';
}

export function getObjectiveProgressSummary(entry: LinkedQuestEntry | undefined): {
  completed: number;
  total: number;
} | null {
  if (!entry?.objectives?.length) return null;
  const completed = entry.objectives.filter((objective) => objective.completed).length;
  return {
    completed,
    total: entry.objectives.length,
  };
}

function isMapNodeUnlockedInLinkedMode(
  mapNode: Quest,
  quests: Quest[],
  snapshot: LinkedQuestSnapshot,
): boolean {
  if (snapshot.source === 'arctracker') {
    // ArcTracker only exposes completed/incomplete quest state and does not
    // provide enough information to model map unlock progression accurately.
    // Keep map nodes visually available in linked ArcTracker mode rather than
    // incorrectly locking them behind missing runtime data.
    return true;
  }

  const descendantIds = collectDescendantIds(mapNode.id, quests);
  for (const questId of descendantIds) {
    const state = snapshot.questsById[questId]?.state;
    if (state === 'completed' || state === 'active') {
      return true;
    }
  }
  return false;
}

function collectDescendantIds(questId: string, quests: Quest[]): string[] {
  const questById = new Map(quests.map((quest) => [quest.id, quest]));
  const visited = new Set<string>();
  const queue = [...(questById.get(questId)?.nextQuestIds ?? [])];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const quest = questById.get(currentId);
    if (quest) {
      queue.push(...quest.nextQuestIds);
    }
  }

  return Array.from(visited);
}

export function isEmbarkQuestState(state: LinkedQuestState | undefined): boolean {
  return state === 'completed' || state === 'active' || state === 'locked' || state === 'unknown';
}
