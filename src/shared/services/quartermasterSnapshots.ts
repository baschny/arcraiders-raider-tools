import { getCurrentSession } from '../auth/cognitoClient';
import { getCachedBlueprints, getCachedHideout, getCachedLoadout, getCachedProfile, getCachedProjects, getCachedStash, getCacheMeta, replaceArcTrackerGameplayCache } from './cacheService';
import { getCachedLinkedQuestSnapshot, writeLinkedQuestSnapshotForUser } from './linkedQuestApi';
import { quartermasterStore } from '../state/stores';
import type { QuartermasterSnapshotPayload, QuartermasterSnapshotRestoreResponse } from '../types/quartermasterSnapshots';

export interface SnapshotCaptureResult {
  payload: QuartermasterSnapshotPayload | null;
  missing: string[];
  syncTimes: Record<string, string | null>;
}

export async function captureCurrentQuartermasterSnapshot(): Promise<SnapshotCaptureResult> {
  const [meta, stash, loadout, blueprints, hideout, projects, quests, profile] = await Promise.all([
    getCacheMeta(), getCachedStash(), getCachedLoadout(), getCachedBlueprints(), getCachedHideout(),
    getCachedProjects(), getCachedLinkedQuestSnapshot(), getCachedProfile(),
  ]);
  const missing: string[] = [];
  if (meta?.source && meta.source !== 'arctracker') missing.push('ArcTracker game data source');
  if (!stash) missing.push('Inventory');
  if (!loadout) missing.push('Loadout');
  if (!blueprints) missing.push('Blueprints');
  if (!hideout) missing.push('Hideout');
  if (!projects) missing.push('Projects');
  if (!quests || quests.source !== 'arctracker') missing.push('Quests');
  const syncTimes = {
    Inventory: stash?.syncedAt ?? null,
    Loadout: loadout?.syncedAt ?? null,
    Blueprints: blueprints?.syncedAt ?? null,
    Hideout: hideout?.syncedAt ?? null,
    Projects: projects?.syncedAt ?? null,
    Quests: quests?.syncedAt ?? null,
  };
  if (missing.length || !stash || !loadout || !blueprints || !hideout || !projects || !quests) {
    return { payload: null, missing, syncTimes };
  }
  const qm = quartermasterStore.get();
  return {
    missing: [], syncTimes,
    payload: {
      snapshotSchemaVersion: 1,
      source: 'arctracker',
      gameplay: { stash, loadout, blueprints, hideout, quests, projects },
      quartermaster: {
        lists: qm.lists,
        hideoutToggles: qm.hideoutToggles,
        projectToggles: qm.projectToggles,
        questToggles: qm.questToggles,
        prioritizedItemIds: qm.prioritizedItemIds,
      },
      playerLevel: profile?.playerLevel ?? null,
    },
  };
}

export async function applyRestoredQuartermasterSnapshot(response: QuartermasterSnapshotRestoreResponse): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.sub) throw new Error('Not signed in');
  const restoredAt = new Date(response.restoredAt);
  if (Number.isNaN(restoredAt.getTime())) throw new Error('Snapshot restore returned an invalid timestamp');
  const payload = normalizeFreshness(response.payload, restoredAt);
  await replaceArcTrackerGameplayCache({
    userSub: session.sub,
    stash: payload.gameplay.stash,
    loadout: payload.gameplay.loadout,
    blueprints: payload.gameplay.blueprints,
    hideout: payload.gameplay.hideout,
    projects: payload.gameplay.projects,
    restoredAt: restoredAt.getTime(),
  });
  writeLinkedQuestSnapshotForUser(session.sub, payload.gameplay.quests);
  await quartermasterStore.hydrate();
}

function normalizeFreshness(payload: QuartermasterSnapshotPayload, restoredAt: Date): QuartermasterSnapshotPayload {
  const clone = structuredClone(payload) as QuartermasterSnapshotPayload;
  const iso = restoredAt.toISOString();
  const ms = restoredAt.getTime();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      if (key === 'syncedAt' || key === 'lastCheckedAt') record[key] = iso;
      else if (key === 'cachedAt') record[key] = ms;
      else visit(child);
    }
  };
  visit(clone.gameplay);
  return clone;
}
