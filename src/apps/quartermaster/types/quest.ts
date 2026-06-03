export interface QuestRequiredItem {
  itemId: string;
  quantity: number;
}

export interface QuestDefinition {
  id: string;
  name: string;
  requiredItems: QuestRequiredItem[];
  previousQuestIds: string[];
  nextQuestIds: string[];
}
