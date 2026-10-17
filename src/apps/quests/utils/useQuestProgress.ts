import { useEffect, useMemo, useState } from 'react';
import { getCachedLinkedQuestSnapshot } from '../../../shared/services/linkedQuestApi';
import { questsStore, useStore } from '../../../shared/state/stores';
import type { LinkedQuestSnapshot } from '../../../shared/types/linkedQuests';
import { migrateQuestIds } from '../data/questIdMigration';
import type { Quest } from '../types/quest';
import { buildLinkedCompletedQuestSet, getQuestDisplayStatus, type QuestDisplayStatus } from './linkedProgress';
import { isObjectiveSatisfied } from './objectiveTree';
import { isQuestAvailable } from './questHelpers';
import { doneLeafKeys } from './questSummary';
import { progressFromDone, toggleStep } from './stepProgress';

export interface QuestProgress {
  /** Progress comes from a linked account (the last snapshot the Quest Tracker synced): read-only here. */
  linked: boolean;
  /** The user has any progress (a completed quest or step, or a synced snapshot); a new visitor has none. */
  any: boolean;
  statusOf: (quest: Quest) => QuestDisplayStatus;
  /** Done leaf keys of a quest (all leaves of a completed quest without step progress). */
  doneOf: (quest: Quest) => Set<string>;
  /** Marks a step done / not done; the quest is completed or reopened when its steps say so. Manual mode only. */
  toggleStep: (quest: Quest, key: string) => void;
}

/**
 * The Quest Tracker's progress for other pages, e.g. the quest steps on the maps: the manual progress (questsStore),
 * or in linked mode the snapshot the tracker last synced (cached in the browser; nothing is fetched here). Same rules
 * as the tracker's step toggle, except that completing a quest here does not offer to complete its prerequisites.
 */
export function useQuestProgress(quests: Quest[] | null): QuestProgress {
  const [state, setState] = useStore(questsStore);
  const linked = state.mode === 'linked';
  const [snapshot, setSnapshot] = useState<LinkedQuestSnapshot | null>(null);
  useEffect(() => {
    if (!linked) return;
    let cancelled = false;
    getCachedLinkedQuestSnapshot().then((s) => !cancelled && setSnapshot(s), () => {});
    return () => {
      cancelled = true;
    };
  }, [linked]);
  const manualDone = useMemo(() => new Set(migrateQuestIds(state.manualCompletedQuestIds ?? [])), [state.manualCompletedQuestIds]);
  const linkedDone = useMemo(() => (linked && snapshot && quests ? buildLinkedCompletedQuestSet(quests, snapshot) : new Set<string>()), [linked, snapshot, quests]);
  const steps = state.manualStepProgress;

  const doneOf = (quest: Quest) => {
    if (linked) {
      const objectives = snapshot?.source === 'embark' ? snapshot.questsById[quest.id]?.objectives : undefined;
      return doneLeafKeys(quest, objectives, linkedDone.has(quest.id));
    }
    const keys = steps?.[quest.id];
    return doneLeafKeys(quest, keys?.length ? progressFromDone(quest.objectiveLeafKeys, new Set(keys)) : undefined, manualDone.has(quest.id));
  };
  const statusOf = (quest: Quest): QuestDisplayStatus => {
    if (linked) return snapshot ? getQuestDisplayStatus({ quest, linkedSnapshot: snapshot, linkedCompletedQuests: linkedDone }) : 'unknown';
    if (manualDone.has(quest.id)) return 'completed';
    if (!isQuestAvailable(quest, manualDone)) return 'locked';
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
  const any = linked ? !!snapshot : manualDone.size > 0 || Object.values(steps ?? {}).some((k) => k.length > 0);
  return { linked, any, statusOf, doneOf, toggleStep: toggle };
}
