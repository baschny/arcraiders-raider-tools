import type { ItemRarity } from './item';

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
