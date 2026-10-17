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
  /** Hidden content-unlock quest (never shown in the game): kept for the quest chain, never tracked. */
  hidden?: boolean;
}
