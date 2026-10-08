import type { Node } from 'reactflow';
import type { LinkedQuestObjectiveProgress } from '../../../shared/types/linkedQuests';
import type { QuestCategory, Rarity } from '../../../shared/gamedata/types';

export type QuestItemRarity = Rarity;

export interface BlueprintReward {
  id: string;
  name: string;
  imageFilename: string;
}

export interface QuestItemEntry {
  id: string;
  quantity: number;
  name: string;
  /** Absent = the game gives the item no rarity. */
  rarity?: QuestItemRarity;
  imageFilename: string;
  /** Chance (0..1) for entries of random reward pools. */
  chance?: number;
}

/**
 * Objective node as displayed. Hidden nodes are already removed; `text` is missing when the
 * game text has no entry for the node (the node title is skipped, children still render).
 */
export interface ObjectiveView {
  key: string;
  kind: 'atomic' | 'sequence' | 'allOf' | 'anyOf' | 'anyOfExclusive' | 'nOf';
  text?: string;
  /** For 'nOf'. */
  requiredCount?: number;
  oneRound: boolean;
  optional: boolean;
  /** Position among the visible atomic leaves (matches linked-progress objective order). */
  leafIndex?: number;
  children: ObjectiveView[];
}

/** Quest (or map prerequisite node, `trader === 'Map'`) as the quests app renders it. */
export interface Quest {
  id: string;
  name: string;
  /** English name (wiki link). */
  originalNameEn?: string;
  category: QuestCategory | 'map';
  trader: string;
  map: string[];
  previousQuestIds: string[];
  nextQuestIds: string[];
  hasBlueprint: boolean;
  blueprintRewards: BlueprintReward[];
  description: string;
  /** Visible objective tree; null when the quest has no visible objectives. */
  objectiveTree: ObjectiveView | null;
  /** Texts of the visible atomic leaves in tree order. */
  objectives: string[];
  /** True when the whole objective tree has to be done in a single round. */
  objectivesOneRound: boolean;
  otherRequirements: string[];
  grantedItems: QuestItemEntry[];
  requiredItems: QuestItemEntry[];
  rewardItems: QuestItemEntry[];
  optionalRewardItems: QuestItemEntry[];
  addedIn?: string | null;
  xp?: number;
  isNew?: boolean;
}

export interface QuestNodeData {
  quest: Quest;
  isCompleted: boolean;
  isAvailable: boolean;
  status: 'completed' | 'active' | 'available' | 'locked' | 'unknown';
  isInteractive: boolean;
  isHighlighted: boolean;
  objectiveSummary: {
    completed: number;
    total: number;
  } | null;
  objectiveProgress?: LinkedQuestObjectiveProgress[];
  onToggle: (questId: string) => void;
}

export interface MapNodeData {
  quest: Quest;
  isCompleted: boolean;
  isInteractive: boolean;
  onToggle: (questId: string) => void;
}

export type QuestNode = Node<QuestNodeData>;
export type MapNode = Node<MapNodeData>;
