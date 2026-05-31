import type { BenchId, ItemRarity, PlannerItem } from '../types/item';

type Translate = (key: string) => string;

const categoryKeys: Record<string, string> = {
  Ammunition: 'quartermaster.categories.ammunition',
  Augment: 'quartermaster.categories.augment',
  'Basic Material': 'quartermaster.categories.basicMaterial',
  Key: 'quartermaster.categories.key',
  Misc: 'quartermaster.categories.misc',
  Modification: 'quartermaster.categories.modification',
  Nature: 'quartermaster.categories.nature',
  'Quick Use': 'quartermaster.categories.quickUse',
  Recyclable: 'quartermaster.categories.recyclable',
  'Refined Material': 'quartermaster.categories.refinedMaterial',
  SMG: 'quartermaster.categories.smg',
  Shield: 'quartermaster.categories.shield',
  'Topside Material': 'quartermaster.categories.topsideMaterial',
  Trinket: 'quartermaster.categories.trinket',
  Weapon: 'quartermaster.categories.weapon',
};

const typeKeys: Record<string, string> = {
  Ammunition: 'quartermaster.types.ammunition',
  'Assault Rifle': 'quartermaster.types.assaultRifle',
  Augment: 'quartermaster.types.augment',
  'Basic Material': 'quartermaster.types.basicMaterial',
  'Battle Rifle': 'quartermaster.types.battleRifle',
  'Hand Cannon': 'quartermaster.types.handCannon',
  Key: 'quartermaster.types.key',
  LMG: 'quartermaster.types.lmg',
  Misc: 'quartermaster.types.misc',
  Modification: 'quartermaster.types.modification',
  Nature: 'quartermaster.types.nature',
  Pistol: 'quartermaster.types.pistol',
  'Quick Use': 'quartermaster.types.quickUse',
  Recyclable: 'quartermaster.types.recyclable',
  'Refined Material': 'quartermaster.types.refinedMaterial',
  SMG: 'quartermaster.types.smg',
  Shield: 'quartermaster.types.shield',
  Shotgun: 'quartermaster.types.shotgun',
  'Sniper Rifle': 'quartermaster.types.sniperRifle',
  Special: 'quartermaster.types.special',
  'Topside Material': 'quartermaster.types.topsideMaterial',
  Trinket: 'quartermaster.types.trinket',
};

const locationKeys: Record<string, string> = {
  ARC: 'quartermaster.locations.arc',
  Commercial: 'quartermaster.locations.commercial',
  Electrical: 'quartermaster.locations.electrical',
  Exodus: 'quartermaster.locations.exodus',
  Industrial: 'quartermaster.locations.industrial',
  Mechanical: 'quartermaster.locations.mechanical',
  Medical: 'quartermaster.locations.medical',
  Nature: 'quartermaster.locations.nature',
  'Old World': 'quartermaster.locations.oldWorld',
  Raider: 'quartermaster.locations.raider',
  Residential: 'quartermaster.locations.residential',
  Security: 'quartermaster.locations.security',
  Technological: 'quartermaster.locations.technological',
};

const rarityKeys: Record<ItemRarity, string> = {
  Common: 'quartermaster.rarities.common',
  Uncommon: 'quartermaster.rarities.uncommon',
  Rare: 'quartermaster.rarities.rare',
  Epic: 'quartermaster.rarities.epic',
  Legendary: 'quartermaster.rarities.legendary',
};

const benchKeys: Record<BenchId, string> = {
  refiner: 'quartermaster.benches.refiner',
  equipment_bench: 'quartermaster.benches.equipmentBench',
  explosives_bench: 'quartermaster.benches.explosivesBench',
  med_station: 'quartermaster.benches.medStation',
  utility_bench: 'quartermaster.benches.utilityBench',
  weapon_bench: 'quartermaster.benches.weaponBench',
  workbench: 'quartermaster.benches.workbench',
};

const uncraftableReasonKeys = {
  blueprint_locked: 'quartermaster.status.blueprintLocked',
  insufficient_bench_level: 'quartermaster.status.benchLevelTooLow',
  missing_bench: 'quartermaster.status.noCraftBench',
  cycle: 'quartermaster.status.craftCycle',
} as const;

export function getLocalizedQuartermasterCategory(t: Translate, category: string): string {
  return categoryKeys[category] ? t(categoryKeys[category]) : category;
}

export function getLocalizedQuartermasterType(t: Translate, type: string): string {
  return typeKeys[type] ? t(typeKeys[type]) : type;
}

export function getLocalizedQuartermasterLocation(t: Translate, location: string): string {
  return locationKeys[location] ? t(locationKeys[location]) : location;
}

export function getLocalizedQuartermasterRarity(t: Translate, rarity: ItemRarity): string {
  return t(rarityKeys[rarity]);
}

export function getLocalizedBenchName(t: Translate, benchId: BenchId): string {
  return t(benchKeys[benchId]);
}

export function getUncraftableReasonLabel(
  t: Translate,
  reason: keyof typeof uncraftableReasonKeys | undefined,
): string {
  if (!reason) return '';
  return t(uncraftableReasonKeys[reason]);
}

export function formatHideoutListName(
  t: Translate,
  moduleName: string,
  level: number,
  isNext: boolean,
): string {
  void isNext;

  if (level === 1) {
    return `${moduleName} ${t('quartermaster.hideout.unlock')}`;
  }

  return `${moduleName} ${t('quartermaster.hideout.tierLabel').replace('{level}', String(level))}`;
}

export function formatProjectListName(
  t: Translate,
  projectName: string,
  stepIndex: number,
  stepName: string,
): string {
  return t('quartermaster.projects.listName')
    .replace('{project}', projectName)
    .replace('{step}', String(stepIndex))
    .replace('{name}', stepName);
}

export function sortQuartermasterItemsByName<T extends { name: string }>(
  items: T[],
  compareText: (left: string, right: string) => number,
): T[] {
  return [...items].sort((a, b) => compareText(a.name, b.name));
}

export function getQuartermasterItemName(item: Pick<PlannerItem, 'name'>): string {
  return item.name;
}
