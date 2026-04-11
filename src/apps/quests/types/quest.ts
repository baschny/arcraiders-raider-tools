import type { Node } from 'reactflow';
export interface BlueprintReward {
  id: string;
  name: string;
  originalNameEn?: string;
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
}

export interface QuestNodeData {
  quest: Quest;
  isCompleted: boolean;
  isAvailable: boolean;
  isHighlighted: boolean;
  onToggle: (questId: string) => void;
}

export interface MapNodeData {
  quest: Quest;
  isCompleted: boolean;
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

export interface LocalizedQuest extends Omit<Quest, 'name' | 'blueprintRewards'> {
  name: {
    value: string;
    originalEn: string;
  };
  blueprintRewards: LocalizedBlueprintReward[];
}
