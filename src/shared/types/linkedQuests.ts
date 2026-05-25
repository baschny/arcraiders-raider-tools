export type LinkedQuestSource = 'arctracker' | 'embark';

export type LinkedQuestState = 'completed' | 'active' | 'locked' | 'unknown';

export interface LinkedQuestObjectiveProgress {
  completed: boolean;
  currentAmount: number | null;
  requiredAmount: number | null;
}

export interface LinkedQuestEntry {
  state: LinkedQuestState;
  completed: boolean;
  objectives?: LinkedQuestObjectiveProgress[];
}

export interface LinkedQuestSnapshot {
  source: LinkedQuestSource;
  syncedAt: string;
  cachedAt: number;
  etag?: string | null;
  lastModified?: string | null;
  lastCheckedAt?: string | null;
  nextAllowedAt?: string | null;
  questsById: Record<string, LinkedQuestEntry>;
}
