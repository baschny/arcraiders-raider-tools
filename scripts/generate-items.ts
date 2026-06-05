#!/usr/bin/env npx tsx

/**
 * Shared Item Generator
 *
 * Reads item JSON files from ../arcraiders-data/items/ and generates
 * a canonical aggregated dataset at public/data/items/items.<locale>.json
 *
 * Preserves ALL upstream fields (no transformations).
 * Excludes only Outfit and Backpack Charm types.
 * Computes weapon chain metadata (upgradesFrom, weaponBaseId, weaponTier).
 */

import * as fs from 'fs';
import * as path from 'path';

const LOCALES = [
  'en',
  'de',
  'pt-BR',
  'es',
  'fr',
  'it',
  'ja',
  'ko-KR',
  'pl',
  'ru',
  'tr',
  'zh-CN',
  'zh-TW',
] as const;
type OutputLocale = (typeof LOCALES)[number];

// Items excluded from generation (not used by any app)
const EXCLUDED_TYPES = new Set(['Outfit', 'Backpack Charm']);

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function sortObjectKeys<T>(obj: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key] = obj[key];
  }
  return sorted;
}

function getLocalizedValue(
  values: Record<string, string> | undefined,
  locale: OutputLocale
): string {
  if (!values) {
    return '';
  }

  if (locale === 'pt-BR') {
    return values['pt-BR'] ?? values.pt ?? values.en ?? '';
  }

  if (locale === 'ko-KR') {
    return values['ko-KR'] ?? values.ko ?? values.kr ?? values.en ?? '';
  }

  return values[locale] ?? values.en ?? '';
}

// ---------------------------------------------------------------------------
// Item processing
// ---------------------------------------------------------------------------

interface SourceItem {
  id: string;
  name: { en: string; [key: string]: string };
  description?: { en: string; [key: string]: string };
  type: string;
  rarity: string;
  value?: number;
  weightKg?: number;
  stackSize?: number;
  isWeapon?: boolean;
  imageFilename?: string;
  foundIn?: string | string[];
  craftBench?: string | string[];
  stationLevelRequired?: number;
  blueprintLocked?: boolean;
  craftQuantity?: number;
  recipe?: Record<string, number>;
  upgradeCost?: Record<string, number>;
  upgradesTo?: string;
  recyclesInto?: Record<string, number>;
  salvagesInto?: Record<string, number>;
  repairCost?: Record<string, number>;
  repairDurability?: number;
  questItem?: boolean;
  effects?: Record<string, unknown>;
  modSlots?: Record<string, string[]>;
  craftSkills?: Record<string, string[]>;
  vendors?: unknown[];
  updatedAt?: string;
  addedIn?: string;
  [key: string]: unknown;
}

interface GeneratedItem {
  name: {
    value: string;
    originalEn: string;
  };
  description: string;
  type: string;
  rarity: string;
  value?: number;
  weightKg?: number;
  stackSize: number;
  isWeapon?: boolean;
  imageFilename?: string;
  foundIn?: string[] | string;
  craftBench?: string | string[];
  stationLevelRequired?: number;
  blueprintLocked?: boolean;
  craftQuantity: number;
  recipe?: Record<string, number>;
  upgradeCost?: Record<string, number>;
  upgradesTo?: string;
  upgradesFrom?: string;
  weaponBaseId?: string;
  weaponTier?: 1 | 2 | 3 | 4;
  recyclesInto?: Record<string, number>;
  salvagesInto?: Record<string, number>;
  repairCost?: Record<string, number>;
  repairDurability?: number;
  questItem?: boolean;
  effects?: Record<string, unknown>;
  modSlots?: Record<string, string[]>;
  craftSkills?: Record<string, string[]>;
  vendors?: unknown[];
  updatedAt?: string;
  addedIn?: string;
  [key: string]: unknown;
}

function processItem(source: SourceItem, locale: OutputLocale): { id: string; item: GeneratedItem } | undefined {
  if (EXCLUDED_TYPES.has(source.type)) {
    return undefined;
  }

  const item: GeneratedItem = {
    name: {
      value: getLocalizedValue(source.name, locale),
      originalEn: source.name.en,
    },
    description: getLocalizedValue(source.description, locale),
    type: source.type,
    rarity: source.rarity,
    stackSize: source.stackSize ?? 1,
    craftQuantity: source.craftQuantity ?? 1,
    ...(source.value !== undefined && { value: source.value }),
    ...(source.weightKg !== undefined && { weightKg: source.weightKg }),
    ...(source.isWeapon !== undefined && { isWeapon: source.isWeapon }),
    ...(source.imageFilename !== undefined && { imageFilename: source.imageFilename }),
    ...(source.foundIn !== undefined && { foundIn: source.foundIn }),
    ...(source.craftBench !== undefined && { craftBench: source.craftBench }),
    ...(source.stationLevelRequired !== undefined && { stationLevelRequired: source.stationLevelRequired }),
    ...(source.blueprintLocked !== undefined && { blueprintLocked: source.blueprintLocked }),
    ...(source.recipe && Object.keys(source.recipe).length > 0 && { recipe: sortObjectKeys(source.recipe) }),
    ...(source.upgradeCost && Object.keys(source.upgradeCost).length > 0 && { upgradeCost: sortObjectKeys(source.upgradeCost) }),
    ...(source.upgradesTo && { upgradesTo: source.upgradesTo }),
    ...(source.recyclesInto && Object.keys(source.recyclesInto).length > 0 && { recyclesInto: sortObjectKeys(source.recyclesInto) }),
    ...(source.salvagesInto && Object.keys(source.salvagesInto).length > 0 && { salvagesInto: sortObjectKeys(source.salvagesInto) }),
    ...(source.repairCost && Object.keys(source.repairCost).length > 0 && { repairCost: sortObjectKeys(source.repairCost) }),
    ...(source.repairDurability !== undefined && { repairDurability: source.repairDurability }),
    ...(source.questItem === true && { questItem: true }),
    ...(source.effects !== undefined && { effects: source.effects }),
    ...(source.modSlots !== undefined && { modSlots: source.modSlots }),
    ...(source.craftSkills !== undefined && { craftSkills: source.craftSkills }),
    ...(source.vendors !== undefined && { vendors: source.vendors }),
    ...(source.updatedAt !== undefined && { updatedAt: source.updatedAt }),
    ...(source.addedIn !== undefined && { addedIn: source.addedIn }),
  };

  return { id: source.id, item };
}

function addWeaponChainMetadata(items: Record<string, GeneratedItem>): void {
  const upgradesFromByTarget = new Map<string, string>();

  for (const [itemId, item] of Object.entries(items)) {
    if (item.upgradesTo && items[item.upgradesTo]) {
      upgradesFromByTarget.set(item.upgradesTo, itemId);
    }
  }

  upgradesFromByTarget.forEach((sourceId, targetId) => {
    items[targetId].upgradesFrom = sourceId;
  });

  const roots = Object.keys(items)
    .filter((itemId) => {
      const item = items[itemId];
      return (item.upgradesTo || item.upgradesFrom) && !item.upgradesFrom;
    })
    .sort();

  for (const rootId of roots) {
    let currentId: string | undefined = rootId;
    let tier = 1;
    const visited = new Set<string>();

    while (currentId && items[currentId] && !visited.has(currentId)) {
      visited.add(currentId);
      items[currentId].weaponBaseId = rootId;
      if (tier >= 1 && tier <= 4) {
        items[currentId].weaponTier = tier as 1 | 2 | 3 | 4;
      }
      currentId = items[currentId].upgradesTo;
      tier++;
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const scriptPath = path.resolve(process.argv[1] ?? './scripts/generate-items.ts');
  const scriptDir = path.dirname(scriptPath);
  const sourceDir = path.resolve(scriptDir, '../../arcraiders-data/items');
  const destDir = path.resolve(scriptDir, '../public/data/items');

  if (!fs.existsSync(sourceDir)) {
    console.error(`Error: Source directory does not exist: ${sourceDir}`);
    process.exit(1);
  }

  // Read and sort filenames ASCII ascending for determinism
  const files = fs.readdirSync(sourceDir)
    .filter(f => f.endsWith('.json'))
    .sort();

  // Parse all source items once (shared across all locales)
  const sources: SourceItem[] = [];
  for (const file of files) {
    const filePath = path.join(sourceDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      sources.push(JSON.parse(content));
    } catch (err) {
      console.error(`Error processing ${file}:`, err);
      process.exit(1);
    }
  }

  console.log(`Read ${sources.length} source items from ${sourceDir}`);

  // Ensure output directory exists
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  for (const locale of LOCALES) {
    const items: Record<string, GeneratedItem> = {};
    let processedCount = 0;
    let excludedCount = 0;

    for (const source of sources) {
      const result = processItem(source, locale);
      if (result) {
        items[result.id] = result.item;
        processedCount++;
      } else {
        excludedCount++;
      }
    }

    addWeaponChainMetadata(items);

    // Sort items by key ASCII ascending
    const sortedItems: Record<string, GeneratedItem> = {};
    const sortedKeys = Object.keys(items).sort();
    for (const key of sortedKeys) {
      sortedItems[key] = items[key];
    }

    const output = {
      version: 1,
      items: sortedItems,
    };

    const destFile = path.join(destDir, `items.${locale}.json`);
    fs.writeFileSync(destFile, JSON.stringify(output, null, 2) + '\n');

    console.log(`Generated ${destFile} (${processedCount} items, ${excludedCount} excluded)`);
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
