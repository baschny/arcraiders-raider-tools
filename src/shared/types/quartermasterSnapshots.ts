import type { CachedBlueprints, CachedHideout, CachedLoadout, CachedProjects, CachedStash } from './arctracker';
import type { LinkedQuestSnapshot } from './linkedQuests';
import type { QuartermasterState } from '../state/stores';

export interface QuartermasterSnapshotMetadata {
  snapshotId: string;
  snapshotSchemaVersion: number;
  source: 'arctracker';
  name: string;
  description: string | null;
  createdAt: string;
  playerLevel: number | null;
  ownedItemQuantities: Record<string, number>;
  hideoutModules: Array<{ moduleId: string; currentLevel: number; maxLevel: number }>;
  completedQuestIds: string[];
}

export interface QuartermasterSnapshotPayload {
  snapshotSchemaVersion: number;
  source: 'arctracker';
  gameplay: {
    stash: CachedStash;
    loadout: CachedLoadout;
    blueprints: CachedBlueprints;
    hideout: CachedHideout;
    quests: LinkedQuestSnapshot;
    projects: CachedProjects;
  };
  quartermaster: Pick<QuartermasterState,
    'lists' | 'hideoutToggles' | 'projectToggles' | 'questToggles' | 'prioritizedItemIds'>;
  playerLevel?: number | null;
}

export interface QuartermasterSnapshotRestoreResponse {
  snapshot: QuartermasterSnapshotMetadata;
  restoredAt: string;
  payload: QuartermasterSnapshotPayload;
  quartermaster: {
    schemaVersion: number;
    data: QuartermasterState;
    revision: number;
    updatedAt: string;
  };
}
