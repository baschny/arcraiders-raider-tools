import type { BenchId, ItemRarity, PlannerItem } from '../types/item';

type Translate = (key: string) => string;

const rarityKeys: Record<ItemRarity, string> = {
  Common: 'quartermaster.rarities.common',
  Uncommon: 'quartermaster.rarities.uncommon',
  Rare: 'quartermaster.rarities.rare',
  Epic: 'quartermaster.rarities.epic',
  Legendary: 'quartermaster.rarities.legendary',
  Amplified: 'quartermaster.rarities.amplified',
};

const benchKeys: Record<string, string> = {
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

export function getLocalizedQuartermasterRarity(t: Translate, rarity: ItemRarity): string {
  return t(rarityKeys[rarity]);
}

/** Localized bench names from the benches game-data domain (fallback for benches without i18n key). */
const dataBenchNames = new Map<string, string>();

export function registerBenchNames(names: Record<string, string>): void {
  for (const [id, name] of Object.entries(names)) dataBenchNames.set(id, name);
}

export function getLocalizedBenchName(t: Translate, benchId: BenchId): string {
  const key = benchKeys[benchId];
  if (key) return t(key);
  return dataBenchNames.get(benchId) ?? benchId;
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
