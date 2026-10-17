import type { Node } from 'reactflow';
import type { LinkedQuestObjectiveProgress } from '../../../shared/types/linkedQuests';
import type { ObjectiveKind, QuestCategory, QuestUnlock, Rarity } from '../../../shared/gamedata/types';

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

/** Why a step lists an item: needed at the object (used up / kept), handed in, obtained, brought. */
export type StepItemRole = 'consumed' | 'kept' | 'deliver' | 'obtain' | 'bring';

/**
 * Objective node as displayed: the quest's objective tree after display normalization
 * (`normalizeObjectiveTree`). Hidden nodes are kept (`hidden` = the game shows them only once
 * reached); `text` is missing when the game text has no entry for the node.
 */
export interface ObjectiveView {
  /** Node key ('0.1.2'), as in the game data and the linked progress. */
  key: string;
  kind: ObjectiveKind;
  text?: string;
  /** In-game interaction prompt of an Interact target ("Repair"). */
  prompt?: string;
  /** Seconds the interaction is held. */
  holdSeconds?: number;
  /** For 'nOf'. */
  requiredCount?: number;
  oneRound: boolean;
  optional: boolean;
  hidden: boolean;
  /** Atomic only: action type (VisitPOI, Interact, Photo, Deliver, …) and amount. */
  actionType?: string;
  amount?: number;
  /** Atomic only: the maps the step is bound to (slugs) and their localized names. */
  mapIds?: string[];
  mapNames?: string[];
  /** Atomic only: items to take into the round, hand in or find for this step. */
  items?: (QuestItemEntry & { role: StepItemRole })[];
  children: ObjectiveView[];
}

/**
 * A hidden quest of the game that only unlocks other quests (category 'unlock'). The game never
 * shows these; the site names them by what unlocks them, never by their internal name.
 */
export interface QuestUnlockView {
  kind: QuestUnlock['kind'];
  /** Localized label ("Play 18 rounds", "Enter Bunker Interior"). */
  label: string;
  /** Localized second line (the map of a location), if any. */
  detail?: string;
}

/** Quest (or unlock node, `category === 'unlock'`) as the quests app renders it. */
export interface Quest {
  id: string;
  name: string;
  /** English name (wiki link). */
  originalNameEn?: string;
  category: QuestCategory | 'unlock';
  /** Unlock nodes only. */
  unlock?: QuestUnlockView;
  trader: string;
  map: string[];
  previousQuestIds: string[];
  nextQuestIds: string[];
  hasBlueprint: boolean;
  blueprintRewards: BlueprintReward[];
  description: string;
  /** Objective tree; null when the quest has no objectives with text. */
  objectiveTree: ObjectiveView | null;
  /** Texts of the atomic leaves in tree order (hidden ones included). */
  objectives: string[];
  /**
   * Keys of all atomic leaves in tree order: the order of the linked progress objectives
   * (Embark lists every leaf objective sorted by key).
   */
  objectiveLeafKeys: string[];
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
  status: 'completed' | 'active' | 'available' | 'locked' | 'unknown';
  isInteractive: boolean;
  isHighlighted: boolean;
  objectiveProgress?: LinkedQuestObjectiveProgress[];
  onToggle: (questId: string) => void;
  onOpenDetails: (questId: string) => void;
}

export interface UnlockNodeData {
  quest: Quest;
  status: QuestNodeData['status'];
  isInteractive: boolean;
  isHighlighted: boolean;
  onToggle: (questId: string) => void;
}

export type QuestNode = Node<QuestNodeData>;
export type UnlockNode = Node<UnlockNodeData>;

export function isUnlockNode(quest: Pick<Quest, 'category'>): boolean {
  return quest.category === 'unlock';
}
