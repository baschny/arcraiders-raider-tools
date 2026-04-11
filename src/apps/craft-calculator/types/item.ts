export interface LocalizedString {
  en: string;
  de?: string;
  fr?: string;
  es?: string;
  pt?: string;
  pl?: string;
  no?: string;
  da?: string;
  it?: string;
  ru?: string;
  ja?: string;
  'zh-TW'?: string;
  uk?: string;
  'zh-CN'?: string;
  kr?: string;
  tr?: string;
  hr?: string;
  sr?: string;
}

export interface ItemRecipe {
  [materialId: string]: number;
}

export interface LocalizedItemName {
  value: string;
  originalEn: string;
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
}

export interface LocalizedItem {
  id: string;
  name: LocalizedItemName;
  stackSize: number;
  value?: number | null;
  imageFilename?: string;
  isWeapon?: boolean | null;
  recipe?: ItemRecipe;
  upgradeCost?: ItemRecipe;
  craftQuantity?: number;
}

export interface ItemDatabase {
  [itemId: string]: Item;
}

export interface LocalizedItemDatabase {
  [itemId: string]: LocalizedItem;
}
