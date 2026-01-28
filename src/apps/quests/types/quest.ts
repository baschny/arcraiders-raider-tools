import type { Node } from 'reactflow';

export interface Quest {
  id: string;
  name: string;
  trader: string;
  map: string[];
  previousQuestIds: string[];
  nextQuestIds: string[];
  hasBlueprint: boolean;
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
