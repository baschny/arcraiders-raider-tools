#!/usr/bin/env npx ts-node --esm

/**
 * Quartermaster Item Import Tool
 * 
 * Reads item JSON files from ../arcraiders-data/items/ and generates
 * a normalized, aggregated dataset at public/data/quartermaster/items.json
 * 
 * See docs/specification-quartermaster.md sections 2 and 3 for full specification.
 */

import * as fs from 'fs';
import * as path from 'path';

// Types
type BenchId =
  | 'equipment_bench'
  | 'explosives_bench'
  | 'med_station'
  | 'refiner'
  | 'utility_bench'
  | 'weapon_bench'
  | 'workbench';

type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

interface SourceItem {
  id: string;
  name: { en: string; [key: string]: string };
  description?: { en: string; [key: string]: string };
  type: string;
  rarity: Rarity;
  isWeapon?: boolean;
  craftBench?: string | string[];
  stationLevelRequired?: number;
  blueprintLocked?: boolean;
  craftQuantity?: number;
  recipe?: Record<string, number>;
  recyclesInto?: Record<string, number>;
  salvagesInto?: Record<string, number>;
  stackSize?: number;
  value?: number;
  weightKg?: number;
  foundIn?: string | string[];
  imageFilename?: string;
}

interface PlannerItem {
  name: string;
  description: string;
  icon: string;
  rarity: Rarity;
  type: string;
  category: string;
  subCategory?: string;
  craftBench?: BenchId;
  stationLevelRequired: 1 | 2 | 3;
  blueprintLocked: boolean;
  craftQuantity: number;
  recipe?: Record<string, number>;
  recyclesInto?: Record<string, number>;
  salvagesInto?: Record<string, number>;
  stackSize: number;
  value?: number;
  weight?: number;
  foundIn?: string[];
}

interface OutputData {
  version: number;
  items: Record<string, PlannerItem>;
}

// Excluded types (section 3.1.1)
const EXCLUDED_TYPES = new Set(['Blueprint', 'Outfit', 'Backpack Charm']);

// Valid bench IDs
const VALID_BENCH_IDS = new Set<string>([
  'equipment_bench',
  'explosives_bench',
  'med_station',
  'refiner',
  'utility_bench',
  'weapon_bench',
  'workbench',
]);

/**
 * Normalize craftBench field (section 3.2)
 * Returns undefined if item should be excluded, or a valid BenchId
 */
function normalizeCraftBench(craftBench: string | string[] | undefined): BenchId | undefined {
  if (craftBench === undefined) {
    return undefined;
  }

  // If string
  if (typeof craftBench === 'string') {
    if (craftBench === 'in_raid') {
      return undefined; // Found in raid only, no crafting bench
    }
    if (VALID_BENCH_IDS.has(craftBench)) {
      return craftBench as BenchId;
    }
    return undefined;
  }

  // If array: filter out "in_raid" and "workbench", pick first valid bench
  if (Array.isArray(craftBench)) {
    const filtered = craftBench.filter(b => b !== 'workbench' && b !== 'in_raid');

    for (const bench of filtered) {
      if (VALID_BENCH_IDS.has(bench)) {
        return bench as BenchId;
      }
    }

    return undefined;
  }

  return undefined;
}

/**
 * Map category and subCategory (section 3.3)
 */
function mapCategory(item: SourceItem, craftBench: BenchId | undefined): { category: string; subCategory?: string } {
  // 3.3.1 Weapon mapping
  if (item.isWeapon === true) {
    return {
      category: 'Weapon',
      subCategory: item.type,
    };
  }

  // 3.3.2 Quick Use mapping
  if (item.type === 'Quick Use') {
    let subCategory: string | undefined;
    if (craftBench === 'explosives_bench') {
      subCategory = 'Explosive';
    } else if (craftBench === 'med_station') {
      subCategory = 'Medicinal';
    } else if (craftBench === 'utility_bench') {
      subCategory = 'Utility';
    }
    return {
      category: 'Quick Use',
      subCategory,
    };
  }

  // 3.3.3 Direct mapping
  return {
    category: item.type,
  };
}

/**
 * Parse foundIn field
 */
function parseFoundIn(foundIn: string | string[] | undefined): string[] | undefined {
  if (!foundIn) {
    return undefined;
  }
  if (typeof foundIn === 'string') {
    return foundIn.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }
  return foundIn.length > 0 ? foundIn : undefined;
}

/**
 * Sort object keys ASCII ascending
 */
function sortObjectKeys<T>(obj: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key] = obj[key];
  }
  return sorted;
}

/**
 * Process a single source item into a PlannerItem
 * Returns undefined if item should be excluded
 */
function processItem(source: SourceItem): { id: string; item: PlannerItem } | undefined {
  // 3.1.1 Exclude by type
  if (EXCLUDED_TYPES.has(source.type)) {
    return undefined;
  }

  // 3.2 Normalize craftBench
  const craftBench = normalizeCraftBench(source.craftBench);

  // 3.3 Category mapping
  const { category, subCategory } = mapCategory(source, craftBench);

  // 3.4 Default field completion
  const stackSize = source.stackSize ?? 1;
  const stationLevelRequired = (source.stationLevelRequired ?? 1) as 1 | 2 | 3;
  const blueprintLocked = source.blueprintLocked ?? false;
  const craftQuantity = source.craftQuantity ?? 1;

  // Build PlannerItem with canonical key order
  const item: PlannerItem = {
    name: source.name.en,
    description: source.description?.en ?? '',
    icon: source.imageFilename ?? '',
    rarity: source.rarity,
    type: source.type,
    category,
    ...(subCategory !== undefined && { subCategory }),
    ...(craftBench !== undefined && { craftBench: craftBench as BenchId }),
    stationLevelRequired,
    blueprintLocked,
    craftQuantity,
    ...(source.recipe && Object.keys(source.recipe).length > 0 && { recipe: sortObjectKeys(source.recipe) }),
    ...(source.recyclesInto && Object.keys(source.recyclesInto).length > 0 && { recyclesInto: sortObjectKeys(source.recyclesInto) }),
    ...(source.salvagesInto && Object.keys(source.salvagesInto).length > 0 && { salvagesInto: sortObjectKeys(source.salvagesInto) }),
    stackSize,
    ...(source.value !== undefined && { value: source.value }),
    ...(source.weightKg !== undefined && { weight: source.weightKg }),
    ...(parseFoundIn(source.foundIn) && { foundIn: parseFoundIn(source.foundIn) }),
  };

  return { id: source.id, item };
}

// ---------------------------------------------------------------------------
// Hideout import (CR-002, CR-003)
// ---------------------------------------------------------------------------

interface HideoutSourceLevel {
  level: number;
  requirementItemIds: { itemId: string; quantity: number }[];
}

interface HideoutSource {
  id: string;
  name: { en: string; [key: string]: string };
  maxLevel: number;
  levels: HideoutSourceLevel[];
}

interface HideoutModuleOutput {
  id: string;
  name: string;
  maxLevel: number;
  levels: {
    level: number;
    requirementItemIds: { itemId: string; quantity: number }[];
  }[];
}

function generateHideoutData(scriptDir: string): void {
  const sourceDir = path.resolve(scriptDir, '../../arcraiders-data/hideout');
  const destFile = path.resolve(scriptDir, '../public/data/quartermaster/hideout.json');

  if (!fs.existsSync(sourceDir)) {
    console.error(`Error: Hideout source directory does not exist: ${sourceDir}`);
    process.exit(1);
  }

  // Read and sort filenames ASCII ascending, exclude stash.json
  const files = fs.readdirSync(sourceDir)
    .filter(f => f.endsWith('.json') && f !== 'stash.json')
    .sort();

  console.log(`Processing ${files.length} hideout files from ${sourceDir}...`);

  const modules: HideoutModuleOutput[] = [];

  for (const file of files) {
    const filePath = path.join(sourceDir, file);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const source: HideoutSource = JSON.parse(content);

      modules.push({
        id: source.id,
        name: source.name.en,
        maxLevel: source.maxLevel,
        levels: source.levels.map(level => ({
          level: level.level,
          requirementItemIds: [...level.requirementItemIds]
            .sort((a, b) => a.itemId.localeCompare(b.itemId)),
        })),
      });
    } catch (err) {
      console.error(`Error processing hideout file ${file}:`, err);
      process.exit(1);
    }
  }

  // Sort modules by id ASCII ascending
  modules.sort((a, b) => a.id.localeCompare(b.id));

  // Ensure output directory exists
  const destDir = path.dirname(destFile);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.writeFileSync(destFile, JSON.stringify(modules, null, 2) + '\n');

  console.log(`Done! Generated ${destFile}`);
  console.log(`  Modules: ${modules.length}`);
}

/**
 * Main import function
 */
function main(): void {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const sourceDir = path.resolve(scriptDir, '../../arcraiders-data/items');
  const destFile = path.resolve(scriptDir, '../public/data/quartermaster/items.json');

  // Check source directory exists
  if (!fs.existsSync(sourceDir)) {
    console.error(`Error: Source directory does not exist: ${sourceDir}`);
    process.exit(1);
  }

  // Read and sort filenames (ASCII ascending for determinism)
  const files = fs.readdirSync(sourceDir)
    .filter(f => f.endsWith('.json'))
    .sort();

  console.log(`Processing ${files.length} item files from ${sourceDir}...`);

  const items: Record<string, PlannerItem> = {};
  let processedCount = 0;
  let excludedCount = 0;

  for (const file of files) {
    const filePath = path.join(sourceDir, file);
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const source: SourceItem = JSON.parse(content);
      
      const result = processItem(source);
      if (result) {
        items[result.id] = result.item;
        processedCount++;
      } else {
        excludedCount++;
      }
    } catch (err) {
      console.error(`Error processing ${file}:`, err);
      process.exit(1);
    }
  }

  // Sort items by itemId (ASCII ascending)
  const sortedItems = sortObjectKeys(items);

  // Build output structure
  const output: OutputData = {
    version: 1,
    items: sortedItems,
  };

  // Ensure output directory exists
  const destDir = path.dirname(destFile);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Write with stable formatting
  fs.writeFileSync(destFile, JSON.stringify(output, null, 2) + '\n');

  console.log(`Done! Generated ${destFile}`);
  console.log(`  Processed: ${processedCount} items`);
  console.log(`  Excluded: ${excludedCount} items`);

  // Generate hideout data (CR-002)
  generateHideoutData(scriptDir);
}

main();
