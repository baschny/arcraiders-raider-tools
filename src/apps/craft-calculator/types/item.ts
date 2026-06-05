export interface ItemRecipe {
  [materialId: string]: number;
}

export interface Item {
  id: string;
  name: string;
  originalNameEn?: string;
  stackSize: number;
  value?: number | null;
  imageFilename?: string;
  isWeapon?: boolean | null;
  recipe?: ItemRecipe;
  upgradeCost?: ItemRecipe;
  craftQuantity?: number;
  rarity?: string;
}

export interface ItemDatabase {
  [itemId: string]: Item;
}
