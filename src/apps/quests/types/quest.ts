import type { Node } from 'reactflow';
import type { LinkedQuestObjectiveProgress } from '../../../shared/types/linkedQuests';
import type { ItemRarity } from '../../../shared/types/item';

export type QuestItemRarity = ItemRarity;

export interface BlueprintReward {
  id: string;
  name: string;
  originalNameEn?: string;
  imageFilename: string;
}

export interface QuestItemEntry {
  id: string;
  quantity: number;
  name: string;
  originalNameEn?: string;
  rarity: QuestItemRarity;
  imageFilename: string;
}

export interface Quest {
  id: string;
  name: string;
  originalNameEn?: string;
  trader: string;
  map: string[];
  previousQuestIds: string[];
  nextQuestIds: string[];
  hasBlueprint: boolean;
  blueprintRewards: BlueprintReward[];
  description: string;
  descriptionOriginalEn?: string;
  objectives: string[];
  objectivesOneRound: boolean;
  otherRequirements: string[];
  grantedItems: QuestItemEntry[];
  requiredItems: QuestItemEntry[];
  rewardItems: QuestItemEntry[];
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

export interface LocalizedBlueprintReward extends Omit<BlueprintReward, 'name'> {
  name: {
    value: string;
    originalEn: string;
  };
}

export interface LocalizedQuestItemEntry extends Omit<QuestItemEntry, 'name'> {
  name: {
    value: string;
    originalEn: string;
  };
}

export interface LocalizedQuest
  extends Omit<
    Quest,
    | 'name'
    | 'blueprintRewards'
    | 'description'
    | 'descriptionOriginalEn'
    | 'objectives'
    | 'grantedItems'
    | 'requiredItems'
    | 'rewardItems'
  > {
  name: {
    value: string;
    originalEn: string;
  };
  blueprintRewards: LocalizedBlueprintReward[];
  description: {
    value: string;
    originalEn: string;
  };
  objectives: Array<{ value: string; originalEn: string }>;
  grantedItems: LocalizedQuestItemEntry[];
  requiredItems: LocalizedQuestItemEntry[];
  rewardItems: LocalizedQuestItemEntry[];
}
