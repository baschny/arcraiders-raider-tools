import { useMemo } from 'react';
import { questsStore, useStore } from '../../../shared/state/stores';
import { migrateQuestIds } from '../data/questIdMigration';
import type { Quest } from '../types/quest';
import type { QuestDisplayStatus } from './linkedProgress';
import { isObjectiveSatisfied } from './objectiveTree';
import { isQuestAvailable } from './questHelpers';
import { doneLeafKeys } from './questSummary';
import { progressFromDone, toggleStep } from './stepProgress';

export interface ManualQuestProgress {
  /** Progress comes from a linked account (read in the Quest Tracker only): no status, nothing can be marked here. */
  linked: boolean;
  statusOf: (quest: Quest) => QuestDisplayStatus;
  /** Done leaf keys of a quest (all leaves of a completed quest without step progress). */
  doneOf: (quest: Quest) => Set<string>;
  /** Marks a step done / not done; the quest is completed or reopened when its steps say so. Manual mode only. */
  toggleStep: (quest: Quest, key: string) => void;
}

/**
 * The Quest Tracker's manual progress (questsStore) for other pages, e.g. the quest steps on the maps. Same rules as
 * the tracker's step toggle, except that completing a quest here does not offer to complete its prerequisites.
 */
export function useManualQuestProgress(): ManualQuestProgress {
  const [state, setState] = useStore(questsStore);
  const linked = state.mode === 'linked';
  const completed = useMemo(() => new Set(migrateQuestIds(state.manualCompletedQuestIds ?? [])), [state.manualCompletedQuestIds]);
  const steps = state.manualStepProgress;

  const doneOf = (quest: Quest) => {
    if (linked) return new Set<string>();
    const keys = steps?.[quest.id];
    return doneLeafKeys(quest, keys?.length ? progressFromDone(quest.objectiveLeafKeys, new Set(keys)) : undefined, completed.has(quest.id));
  };
  const statusOf = (quest: Quest): QuestDisplayStatus => {
    if (linked) return 'unknown';
    if (completed.has(quest.id)) return 'completed';
    if (!isQuestAvailable(quest, completed)) return 'locked';
    return steps?.[quest.id]?.length ? 'active' : 'available';
  };
  const toggle = (quest: Quest, key: string) => {
    const tree = quest.objectiveTree;
    if (linked || !tree) return;
    const latest = questsStore.get();
    const done = new Set(migrateQuestIds(latest.manualCompletedQuestIds ?? []));
    const wasDone = done.has(quest.id);
    const saved = latest.manualStepProgress?.[quest.id];
    const current = doneLeafKeys(quest, saved?.length ? progressFromDone(quest.objectiveLeafKeys, new Set(saved)) : undefined, wasDone);
    const next = toggleStep(tree, current, key);
    const keys = quest.objectiveLeafKeys.filter((k) => next.has(k));
    if (next.size > 0 && isObjectiveSatisfied(tree, next)) done.add(quest.id);
    else done.delete(quest.id);
    const { manualStepProgress, ...rest } = latest;
    const progress = { ...manualStepProgress };
    if (keys.length) progress[quest.id] = keys;
    else delete progress[quest.id];
    setState({ ...rest, manualCompletedQuestIds: [...done], ...(Object.keys(progress).length ? { manualStepProgress: progress } : {}) });
  };
  return { linked, statusOf, doneOf, toggleStep: toggle };
}
