export type StackSize = 3 | 5 | 10 | 15 | 50 | 100;

export interface RequiredItem {
  id: string;
  stackSize: StackSize;
  amountRequired: number;
  amountPossessed: number;
  incompleteStackSize: number;
}

export interface CraftedItem {
  stackSize: StackSize;
  incompleteStackSize: number;
}

export interface CraftingRecipe {
  craftedItem: CraftedItem;
  requiredItems: RequiredItem[];
}

export interface StashCalculation {
  totalSlots: number;
  items: Array<{
    stackSize: number;
    amount: number;
    fullStacks: number;
    remainder: number;
    slots: number;
  }>;
}

export interface CraftingDataPoint {
  amount: number;
  slots: number;
}

export interface CraftingResult {
  maxCraftable: number;
  currentStash: StashCalculation;
  afterMaxCraftStash: StashCalculation;
  optimalCraftAmount: number;
  optimalStash: StashCalculation;
  spaceChange: number;
  optimalSpaceChange: number;
  minCraftForReduction: number | null;
  minCraftStash: StashCalculation | null;
  amountToCraft: number;
  allDataPoints: CraftingDataPoint[];
}
