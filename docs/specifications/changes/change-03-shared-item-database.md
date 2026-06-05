# Change-03: Shared Item Database — Unified Item Data Pipeline

## Status
Proposed

## Summary
Replace three separate item data generators (craft-calculator, loot-helper, quartermaster) with one shared generator that produces a single canonical item database at `public/data/items/items.<locale>.json`. All three apps read from this shared data source. Quartermaster-applied domain transformations (exclusions, bench normalization, category mapping) move to load-time in the Quartermaster loader. Weapon chain metadata (`upgradesFrom`, `weaponBaseId`, `weaponTier`) is computed at generation time and included in the shared data. All obsolete scripts and data files are deleted.

## Motivation
- **Three generators, one source**: All three scripts read `../arcraiders-data/items/*.json` (567 files) — duplicating read + transform work
- **Redundant storage**: Three copies of essentially the same data (~3× storage)
- **Inconsistent field naming**: `imageFilename` vs `icon`, `weightKg` vs `weight`
- **Inconsistent data format**: Array (loot-helper) vs object (craft-calc) vs versioned object (quartermaster)
- **English-only descriptions in loot-helper**: Despite being "localized", descriptions are always `.en` only
- **Maintenance burden**: Adding a new field requires updating all three generators

---

## Requirements

### R1 — Shared Item Generator Script

**Create `scripts/generate-items.ts`** — a TypeScript script (runnable via `npx tsx`).

**Source**: `../arcraiders-data/items/*.json`

**Output**: `public/data/items/items.<locale>.json` for 13 locales: `en`, `de`, `pt-BR`, `es`, `fr`, `it`, `ja`, `ko-KR`, `pl`, `ru`, `tr`, `zh-CN`, `zh-TW`

**Locale fallback** (same as existing generators):
- `pt-BR` → `pt` → `en`
- `ko-KR` → `ko` → `kr` → `en`
- All others → `en`

**Output format**:
```typescript
interface ItemsOutput {
  version: number;               // 1
  items: Record<string, RawItem>;
}
```

**`RawItem` shape** (all upstream fields preserved, no transformations; only `Outfit` and `Backpack Charm` excluded):

```typescript
interface RawItem {
  name: {
    value: string;               // Localized name, with fallback chain
    originalEn: string;          // Always the English name from source
  };
  description: string;           // Localized description string (extracted from multilingual object)
  type: string;
  rarity: string;
  value?: number;
  weightKg?: number;
  stackSize: number;             // Default: 1
  isWeapon?: boolean;
  imageFilename?: string;
  foundIn?: string[] | string;   // Preserved as-is from upstream (could be comma-separated string or array)
  craftBench?: string | string[]; // Preserved as-is (no normalization)
  stationLevelRequired?: number;
  blueprintLocked?: boolean;
  craftQuantity: number;         // Default: 1
  recipe?: Record<string, number>;
  upgradeCost?: Record<string, number>;
  upgradesTo?: string;
  upgradesFrom?: string;         // Derived: inverse of upgradesTo (computed during generation)
  weaponBaseId?: string;         // Derived: root ID of weapon upgrade chain (computed during generation)
  weaponTier?: 1 | 2 | 3 | 4;    // Derived: position in upgrade chain (computed during generation)
  recyclesInto?: Record<string, number>;
  salvagesInto?: Record<string, number>;
  repairCost?: Record<string, number>;
  repairDurability?: number;
  questItem?: boolean;
  effects?: Record<string, unknown>;          // Pass through from upstream
  modSlots?: Record<string, string[]>;         // Pass through from upstream
  craftSkills?: Record<string, string[]>;      // Pass through from upstream
  vendors?: unknown[];                          // Pass through from upstream
  updatedAt?: string;
  addedIn?: string;
  [key: string]: unknown;                      // Forward-compat: preserve unknown upstream fields
}
```

**Determinism rules** (same as quartermaster spec):
1. Sort source filenames ASCII ascending before processing
2. Sort items by `itemId` ASCII ascending in output
3. Sort nested maps (`recipe`, `recyclesInto`, `salvagesInto`, `upgradeCost`, `repairCost`) by key ASCII ascending
4. Write JSON with stable key ordering and consistent formatting (2-space indent)

**Weapon chain metadata derivation** (moved from `quartermaster-import.ts:addWeaponChainMetadata` into the shared generator):
- Build inverse map: for each item with `upgradesTo`, set `upgradesFrom` on the target item to the source item ID
- Build weapon chains: find roots (items with `upgradesTo` but no `upgradesFrom`). For each chain:
  - Set `weaponBaseId` to the root item ID for all items in the chain
  - Set `weaponTier` to 1, 2, 3, 4 walking `upgradesTo` links
- Both weapons and non-weapons may have these fields (only weapons form chains)

**Items excluded from generation**: Items with `type === "Outfit"` or `type === "Backpack Charm"` are excluded. These item types are not used by any application. `Blueprint` items **are** included — the quest app needs them for blueprint reward resolution, and the embark inventory mapping resolves blueprint-to-item links.

---

### R2 — Shared Data Type

**Modify `src/shared/types/item.ts`** — add the `RawItem` interface:

```typescript
export type ItemRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

export interface RawItemName {
  value: string;
  originalEn: string;
}

export interface RawItem {
  name: RawItemName;
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
  [key: string]: unknown;  // Accept and preserve any future upstream fields
}

export interface RawItemsOutput {
  version: number;
  items: Record<string, RawItem>;
}
```

The index signature ensures forward-compatibility: if the upstream data adds new fields, they pass through the generator and into the generated JSON without TypeScript errors. The generator emits **all** keys present on each source item (including unknown ones), sorted ASCII-ascending after the known fields.

---

### R3 — Craft Calculator: Loader Update

**File**: `src/apps/craft-calculator/utils/itemData.ts`

Change the fetch URL (line 28):
```
'/data/craft-calculator/items.json'  →  '/data/items/items.json'
```

**Structural change**: The new shared format is `{ version, items: Record<string, RawItem> }` — not a flat object. Update the import and iteration:

1. Import `RawItemsOutput` from shared types:
   ```typescript
   import type { RawItemsOutput } from '../../../shared/types/item';
   ```

2. Change the fetch call from `LocalizedItemDatabase` to `RawItemsOutput`:
   ```typescript
   const data = await fetchLocalizedJson<RawItemsOutput>('/data/items/items.json', locale);
   ```

3. Iterate `data.items` instead of the response directly. `RawItem` has no `id` field — assign the key as `id`:
   ```typescript
   const items: ItemDatabase = Object.fromEntries(
     Object.entries(data.items).map(([itemId, raw]) => [
       itemId,
       {
         id: itemId,
         name: raw.name.value,
         originalNameEn: raw.name.originalEn,
         stackSize: raw.stackSize,
         value: raw.value,
         imageFilename: raw.imageFilename,
         isWeapon: raw.isWeapon,
         recipe: raw.recipe,
         upgradeCost: raw.upgradeCost,
         craftQuantity: raw.craftQuantity,
         rarity: raw.rarity,
       },
     ])
   );
   ```

4. Remove the import of `LocalizedItemDatabase` from `../types/item` (no longer used). The `LocalizedItem` type can be removed from `types/item.ts` as well.

**File**: `src/apps/craft-calculator/types/item.ts`

The `Item` interface stays as-is — the explicit mapping in the loader only extracts the fields CC actually uses. Remove `LocalizedItem`, `LocalizedItemDatabase`, and `LocalizedItemName` interfaces — the app no longer fetches localized items from the old endpoint. The `ItemDatabase` type remains as `Record<string, Item>`.

---

### R4 — Loot Helper: Loader Update

**File**: `src/apps/loot-helper/utils/dataLoader.ts`

Change the fetch URL (line 80):
```
'/data/items-loot-helper.json'  →  '/data/items/items.json'
```

**Structural change**: The data format changes from a JSON **array** (current loot-helper) to a JSON **object** `{ version, items: Record<string, RawItem> }` (shared). The loader must adapt:

1. Import `RawItemsOutput` from shared types instead of `LocalizedLootHelperItem`:
   ```typescript
   import type { RawItemsOutput } from '../../../shared/types/item';
   ```

2. Replace the fetch call and the item map with an explicit `Object.entries` iteration. `RawItem` has no `id` — assign the key as `id`:

   ```typescript
   export async function loadAllItems(locale: AppLocale): Promise<ItemsMap> {
     const data = await fetchLocalizedJson<RawItemsOutput>('/data/items/items.json', locale);
   
     const items: Item[] = Object.entries(data.items).map(([id, raw]) => ({
       id,
       name: { en: raw.name.value },
       originalNameEn: raw.name.originalEn,
       description: raw.description,
       type: raw.type,
       rarity: raw.rarity as ItemRarity,
       imageFilename: raw.imageFilename,
       value: raw.value,
       weightKg: raw.weightKg,
       stackSize: raw.stackSize,
       foundIn: normalizeFoundIn(raw.foundIn),
       recipe: raw.recipe,
       recyclesInto: raw.recyclesInto,
       salvagesInto: raw.salvagesInto,
       upgradeCost: raw.upgradeCost,
       isWeapon: raw.isWeapon,
        craftBench: normalizeCraftBench(raw.craftBench),
        stationLevelRequired: raw.stationLevelRequired,
       blueprintLocked: raw.blueprintLocked,
       weaponBaseId: raw.weaponBaseId,
       weaponTier: raw.weaponTier,
     }));
   
     const consolidatedItems = consolidateWeaponTiers(items);
   
     const itemsMap: ItemsMap = {};
     consolidatedItems.forEach((item) => {
       itemsMap[item.id] = item;
     });
     return itemsMap;
   }
   
   function normalizeFoundIn(foundIn: string | string[] | undefined): string[] | undefined {
     if (!foundIn) return undefined;
     if (typeof foundIn === 'string') {
       return foundIn.split(',').map(s => s.trim()).filter(Boolean);
     }
     return foundIn.length > 0 ? foundIn : undefined;
   }

   function normalizeCraftBench(craftBench: string | string[] | undefined): string | undefined {
      if (!craftBench) return undefined;
      if (typeof craftBench === 'string') return craftBench;
      const filtered = craftBench.filter(b => b !== 'in_raid' && b !== 'workbench');
      return filtered[0] ?? undefined;
   }
   ```

3. Remove the `LocalizedLootHelperItem` interface (line 71-76) — no longer used.

**Weapon consolidation function (`consolidateWeaponTiers`)**:
- Currently groups weapons by stripping Roman numeral suffix from the English name (`\s+(I{1,3}|IV)$`) and uses `item.tier` for sorting.
- Since the shared data has `weaponBaseId` and `weaponTier`, refactor to use `weaponBaseId` for grouping and `weaponTier` for sorting instead of name-based heuristics:
  - Items with the same `weaponBaseId` form a group. Sort by `weaponTier` (1-4). Take the highest tier item as the base. Accumulate `recipe` from all tiers + `upgradeCost` from tiers 2-4.
  - If `weaponBaseId` is undefined (non-weapon items), skip consolidation (keep as-is).
  - The `Item` interface loses `tier` (not in shared data) and gains optional `weaponBaseId`/`weaponTier`.

**File**: `src/apps/loot-helper/utils/localization.ts`

Line 88 currently reads `item.description?.en`. Since `description` is now a plain string (not `{ en: string }`), change to:
```typescript
export function getLootHelperItemDescription(item: Pick<Item, 'description'>): string | null {
  return item.description ?? null;
}
```

**File**: `src/apps/loot-helper/types/item.ts`

Update:
- Change `description?: ItemName` to `description?: string` (line 18)
- Remove `tier?: number` (line 31) — not in shared data
- Add `weaponBaseId?: string` (optional)
- Add `weaponTier?: 1 | 2 | 3 | 4` (optional)

---

### R5 — Quartermaster: Loader Update

**File**: `src/apps/quartermaster/utils/dataLoader.ts`

Change the items URL (line 14):
```
const ITEMS_URL = '/data/quartermaster/items.json';
→ const ITEMS_URL = '/data/items/items.json';
```

Add load-time transformations in the `loadAllItems` function. After fetching the shared data and before returning the `ItemsMap`, apply:

**R5.1 — Field renames** (shared upstream name → quartermaster `PlannerItem` name):
- `imageFilename` → `icon`
- `weightKg` → `weight`

**R5.2 — Type exclusions** (section 3.1.1 of QM spec):
- Skip items where `rawItem.type === 'Blueprint'`
- Note: `Outfit` and `Backpack Charm` are already excluded by the shared generator (R1) — the Quartermaster loader only needs to exclude `Blueprint`, which remains in the shared data.

**R5.3 — craftBench normalization** (section 3.2 of QM spec):
- If string `"in_raid"` → `undefined`
- If array: remove `"workbench"` and `"in_raid"`, take first remaining → `single BenchId` or `undefined`
- If no craftBench → `undefined`

**R5.4 — Category & subCategory mapping** (section 3.3 of QM spec):
- If `isWeapon === true`: `category = 'Weapon'`, `subCategory = rawItem.type`
- If `type === 'Quick Use'`:
  - `category = 'Quick Use'`
  - `subCategory = 'Explosive'` (explosives_bench), `'Medicinal'` (med_station), `'Utility'` (utility_bench), or `undefined`
- Otherwise: `category = rawItem.type`, `subCategory = undefined`

**R5.5 — Default field completion** (section 3.4 of QM spec):
- `stationLevelRequired`: default `1`
- `blueprintLocked`: default `false`
- `craftQuantity`: default `1`

**R5.6 — Import changes**: The loader needs these imports:
```typescript
import type { RawItemsOutput } from '../../../shared/types/item';
import type { BenchId, ItemsMap, PlannerItem } from '../types/item';
import type { ItemRarity } from '../../../shared/types/item';
```
- Remove the old import of `LocalizedItemsData` from `../types/item`
- `RawItemsOutput` replaces the old fetch type

**R5.7 — Other fields**:
- `craftBench` should be cast to `BenchId` type (validated against the set of known bench IDs)
- `foundIn`: if string, split by comma and trim; if array, use as-is
- `weaponBaseId`, `weaponTier`, `upgradesFrom`, `upgradesTo`: pass through from shared data (already present)
- `questItem`: pass through from shared data
- `repairCost`, `repairDurability`: pass through from shared data (already present)
- `modSlots`, `effects`, `craftSkills`, `vendors`, `updatedAt`, `addedIn`: not in `PlannerItem` — drop them (the `PlannerItem` interface doesn't include these. Use explicit field mapping rather than spreading `...rawItem` to avoid leaking extraneous fields.)

The updated `loadAllItems` function should have this structure:

```typescript
export async function loadAllItems(locale: AppLocale): Promise<ItemsMap> {
  const data = await fetchLocalizedJson<RawItemsOutput>(ITEMS_URL, locale);
  const itemsMap: ItemsMap = {};
  const EXCLUDED_TYPES = new Set(['Blueprint']); // Outfit and Backpack Charm already excluded at generation time
  const VALID_BENCH_IDS = new Set<string>([
    'equipment_bench', 'explosives_bench', 'med_station',
    'refiner', 'utility_bench', 'weapon_bench', 'workbench',
  ]);

  for (const [id, raw] of Object.entries(data.items)) {
    // R5.2: Exclusion by type
    if (EXCLUDED_TYPES.has(raw.type)) continue;

    // R5.3: craftBench normalization
    let craftBench: BenchId | undefined;
    if (raw.craftBench !== undefined) {
      if (typeof raw.craftBench === 'string') {
        craftBench = raw.craftBench !== 'in_raid' && VALID_BENCH_IDS.has(raw.craftBench)
          ? (raw.craftBench as BenchId)
          : undefined;
      } else {
        const filtered = raw.craftBench.filter(b => b !== 'workbench' && b !== 'in_raid');
        for (const bench of filtered) {
          if (VALID_BENCH_IDS.has(bench)) {
            craftBench = bench as BenchId;
            break;
          }
        }
      }
    }

    // R5.4: Category mapping
    let category: string;
    let subCategory: string | undefined;
    if (raw.isWeapon === true) {
      category = 'Weapon';
      subCategory = raw.type;
    } else if (raw.type === 'Quick Use') {
      category = 'Quick Use';
      if (craftBench === 'explosives_bench') subCategory = 'Explosive';
      else if (craftBench === 'med_station') subCategory = 'Medicinal';
      else if (craftBench === 'utility_bench') subCategory = 'Utility';
    } else {
      category = raw.type;
    }

    // R5.5: Defaults
    // R5.1: Field renames
    const item: PlannerItem = {
      id,
      name: raw.name.value,
      originalNameEn: raw.name.originalEn,
      description: raw.description,
      icon: raw.imageFilename ?? '',
      rarity: raw.rarity as ItemRarity,
      type: raw.type,
      category,
      ...(subCategory !== undefined && { subCategory }),
      ...(craftBench !== undefined && { craftBench }),
      stationLevelRequired: (raw.stationLevelRequired ?? 1) as 1 | 2 | 3,
      blueprintLocked: raw.blueprintLocked ?? false,
      craftQuantity: raw.craftQuantity ?? 1,
      ...(raw.recipe && Object.keys(raw.recipe).length > 0 && { recipe: raw.recipe }),
      ...(raw.upgradeCost && Object.keys(raw.upgradeCost).length > 0 && { upgradeCost: raw.upgradeCost }),
      ...(raw.upgradesTo && { upgradesTo: raw.upgradesTo }),
      ...(raw.upgradesFrom && { upgradesFrom: raw.upgradesFrom }),
      ...(raw.weaponBaseId && { weaponBaseId: raw.weaponBaseId }),
      ...(raw.weaponTier !== undefined && { weaponTier: raw.weaponTier as 1 | 2 | 3 | 4 }),
      ...(raw.recyclesInto && Object.keys(raw.recyclesInto).length > 0 && { recyclesInto: raw.recyclesInto }),
      ...(raw.salvagesInto && Object.keys(raw.salvagesInto).length > 0 && { salvagesInto: raw.salvagesInto }),
      ...(raw.repairCost && Object.keys(raw.repairCost).length > 0 && { repairCost: raw.repairCost }),
      ...(raw.repairDurability !== undefined && { repairDurability: raw.repairDurability }),
      stackSize: raw.stackSize,
      ...(raw.value !== undefined && { value: raw.value }),
      ...(raw.weightKg !== undefined && { weight: raw.weightKg }),
      ...(raw.foundIn !== undefined && {
        foundIn: typeof raw.foundIn === 'string'
          ? raw.foundIn.split(',').map(s => s.trim()).filter(Boolean)
          : raw.foundIn,
      }),
      ...(raw.questItem === true && { questItem: true }),
    };

    itemsMap[id] = item;
  }

  return itemsMap;
}
```

**File**: `src/apps/quartermaster/types/item.ts`

No changes needed to `PlannerItem` or `ItemsMap` interfaces — they already define the expected output shape. The `LocalizedPlannerItemData` and `LocalizedItemsData` types (lines 64-77) are no longer used (the loader now reads `RawItemsOutput` from shared types), but can be kept for backward compatibility or removed. Recommend keeping them during transition and removing in a cleanup pass.

Change the import: the `loadAllItems` function no longer imports `LocalizedItemsData` from quartermaster types — it imports `RawItemsOutput` from `src/shared/types/item`.

Add to the import block in `dataLoader.ts`:
```typescript
import type { RawItemsOutput } from '../../../shared/types/item';
```
Remove the import of `LocalizedItemsData` from `../types/item` (lines 8-9).

---

### R6 — Extract Hideout Generator

**Create `scripts/generate-hideout.ts`** by extracting the hideout generation logic from `scripts/quartermaster-import.ts`.

Extract these portions:
- The `generateHideoutData` function (lines 408-467)
- The `loadHideoutBenchImages` function (lines 365-406)
- Supporting types: `HideoutSourceLevel`, `HideoutSource`, `ArctrackerBench`, `HideoutModuleOutput` (lines 331-363)
- The `getLocalizedValue` function (lines 218-233) — shared with item gen but needed by hideout gen

The new script should:
- Accept no arguments (same as old script)
- Read from `../arcraiders-data/hideout/`
- Output to `public/data/quartermaster/hideout.<locale>.json`
- Read `embark-api/data/arctracker-benches.json` for bench images (same as before)
- Generate all 13 locales

**Delete `scripts/quartermaster-import.ts`** after extracting hideout generation.

---

### R7 — Update Quest Data Generator

**File**: `scripts/generate-quest-data.sh`

**Line 16-18**: Change the existence check from loot-helper items to shared items:
```bash
if [ ! -f "$ITEMS_DIR/items/items.en.json" ]; then
  echo "Error: Required item data file not found: $ITEMS_DIR/items/items.en.json"
  echo "Run npm run generate:items first."
  exit 1
fi
```

**Line 26**: Change the items file path:
```bash
ITEMS_FILE="$ITEMS_DIR/items/items.$LOCALE.json"
```

**Line 34**: The jq filter uses `--slurpfile items "$ITEMS_FILE"` to load items. The current loot-helper format is a JSON **array**. The shared format is a JSON **object** `{ version: 1, items: Record<string, RawItem> }`. The jq filter must be updated to navigate this new structure.

In the current jq filter (line 34-110):
- `$items[0]` is the parsed contents of the items file
- The items are accessed as an array with `map(select(.id == $entry.itemId)) | first`

In the new format, `$items[0]` will be `{ version: 1, items: { ... } }`. So accessing item by ID becomes: `$items[0].items[$entry.itemId]`.

Replace the item lookup pattern:
```jq
# Old (loot-helper array format):
($items[0] | map(select(.id == $entry.itemId)) | first) as $item

# New (shared items keyed object format):
($items[0].items[$entry.itemId]) as $item
```

This change applies in two places in the jq filter:
1. In the `resolveItemList` function (accessing `$item.name.value`, `$item.name.originalEn`, `$item.rarity`, `$item.imageFilename`)
2. In the `blueprintRewards` section (same fields)

The rest of the jq filter (quest data structure, locale fallback, etc.) remains unchanged.

---

### R8 — Update Embark Inventory Mapping

**File**: `scripts/generate-embark-inventory-mapping.js`

**Line 12**: Change the quartermaster items path to shared items path:
```js
const quartermasterItemsPath = path.join(repoRoot, 'public/data/quartermaster/items.json');
→ const sharedItemsPath = path.join(repoRoot, 'public/data/items/items.en.json');
```

**Lines 26, 92**: Update the source reference and read:
```js
// In sources object:
quartermasterItems: quartermasterItemsPath,
→ items: sharedItemsPath,

// In main():
const quartermasterItems = readJson(sourceFiles.quartermasterItems).items ?? {};
→ const sharedItems = readJson(sourceFiles.items).items ?? {};
```

**Lines 62, 71, 129**: Rename the variable from `quartermasterItems` to `sharedItems` in the function call and in `resolveBlueprintTargetItemId`. The function signature and logic stay the same — it only checks if an item ID exists as a key, not any specific field.

---

### R9 — Update `package.json`

**Replace** the `generate` meta-script (line 14) to:
```
"generate": "npm run generate:items && npm run generate:quests && npm run generate:hideout && npm run generate:projects-quartermaster && npm run generate:embark-inventory-mapping && npm run generate:schedule"
```

Note: `generate:quests` still runs after `generate:items` (it needs items). `generate:embark-inventory-mapping` also runs after `generate:items` (it needs items). `generate:hideout` replaces what was previously part of `generate:items-quartermaster`.

**Remove** these three scripts (lines 16-18):
- `"generate:items-loot-helper": "./scripts/generate-item-data-loot-helper.sh"`
- `"generate:items-craft-calculator": "./scripts/generate-item-data-craft-calculator.sh"`
- `"generate:items-quartermaster": "./scripts/generate-item-data-quartermaster.sh"`

**Add** these two scripts:
- `"generate:items": "npx tsx ./scripts/generate-items.ts"`
- `"generate:hideout": "npx tsx ./scripts/generate-hideout.ts"`

---

### R10 — Update Test Import Path

**File**: `src/apps/quartermaster/utils/__tests__/weaponUpgradeData.test.ts`

**Line 3**: Change the import path:
```typescript
import itemsData from '../../../../../public/data/quartermaster/items.en.json';
→ import itemsData from '../../../../../public/data/items/items.en.json';
```

The test expects `data.items.anvil_i` to have `upgradesTo`, `weaponBaseId`, `weaponTier`, `upgradeCost`, `upgradesFrom` — all of which are present in the shared data (weapon chain metadata is included). The test should pass without further modification.

---

### R11 — Delete Obsolete Files

**Scripts to delete:**
- `scripts/generate-item-data-craft-calculator.sh`
- `scripts/generate-item-data-loot-helper.sh`
- `scripts/generate-item-data-quartermaster.sh`
- `scripts/quartermaster-import.ts`

**Data directories/files to delete:**
- `public/data/craft-calculator/` (entire directory + all locale files)
- `public/data/items-loot-helper.json` (no-locale legacy)
- `public/data/items-loot-helper.en.json` (all 13 locale variants)
- `public/data/items-loot-helper.de.json`
- `public/data/items-loot-helper.es.json`
- `public/data/items-loot-helper.fr.json`
- `public/data/items-loot-helper.it.json`
- `public/data/items-loot-helper.ja.json`
- `public/data/items-loot-helper.ko-KR.json`
- `public/data/items-loot-helper.pl.json`
- `public/data/items-loot-helper.pt-BR.json`
- `public/data/items-loot-helper.ru.json`
- `public/data/items-loot-helper.tr.json`
- `public/data/items-loot-helper.zh-CN.json`
- `public/data/items-loot-helper.zh-TW.json`
- `public/data/quartermaster/items.json` (no-locale legacy)
- `public/data/quartermaster/items.en.json` (all 13 locale variants)
- `public/data/quartermaster/items.de.json`
- `public/data/quartermaster/items.es.json`
- `public/data/quartermaster/items.fr.json`
- `public/data/quartermaster/items.it.json`
- `public/data/quartermaster/items.ja.json`
- `public/data/quartermaster/items.ko-KR.json`
- `public/data/quartermaster/items.pl.json`
- `public/data/quartermaster/items.pt-BR.json`
- `public/data/quartermaster/items.ru.json`
- `public/data/quartermaster/items.tr.json`
- `public/data/quartermaster/items.zh-CN.json`
- `public/data/quartermaster/items.zh-TW.json`

**Keep:**
- `public/data/quartermaster/hideout.*.json` (still in use, now generated by `scripts/generate-hideout.ts`)
- `public/data/quartermaster/projects.*.json` (separate generator, unchanged)
- `public/data/quartermaster/hideout.json` (no-locale legacy, kept for fallback)

---

### R12 — Update Documentation

**File**: `AGENTS.md`

Lines 37-40: Update the generation command reference to:
- Remove references to `generate:items-loot-helper`, `generate:items-craft-calculator`, `generate:items-quartermaster`
- Add reference to `generate:items`

Line 81: Update the example path from `public/data/craft-calculator/items.en.json` to `public/data/items/items.en.json`

**File**: `docs/specifications/quartermaster/specification-quartermaster.md`

Update **Section 3 (Item Import & Normalization Process)** (lines 333-540):

- Replace section 3.5 (CLI Import Tool) to reflect that:
  - Item data is now sourced from the shared database at `public/data/items/items.<locale>.json` (not generated by a QM-specific script)
  - The QM-specific transformations (3.1 exclusions, 3.2 bench normalization, 3.3 category mapping, 3.4 field defaults) now happen at load time in `src/apps/quartermaster/utils/dataLoader.ts::loadAllItems()`
  - Hideout data generation remains as `scripts/generate-hideout.ts`, outputting to `public/data/quartermaster/hideout.<locale>.json`
  - The `package.json` scripts `generate:items` and `generate:hideout` replace the former `generate:items-quartermaster`

---

### R13 — Generate Initial Data

After full implementation (all loader changes, quest generator update, embark mapping update), run the complete generation pipeline:
```bash
npm run generate
```

This produces:
- `public/data/items/items.*.json` (shared item database, all 13 locales)
- `public/data/quests/quest-data.*.json` (quest data — updated to read from shared items)
- `public/data/quartermaster/hideout.*.json` (extracted from quartermaster-import)
- `infra/lambda/data/embark-inventory-mapping.json` (updated to read from shared items)
- All other generated assets (schedule, maps, projects)

All generated files must be committed to git.

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `scripts/generate-items.ts` | Shared item generator from `../arcraiders-data/items/` to `public/data/items/` |
| `scripts/generate-hideout.ts` | Hideout generator (extracted from `quartermaster-import.ts`) |
| `public/data/items/items.en.json` | Shared item database (generated; +12 locale variants) |

### Modified Files

| File | Change |
|------|--------|
| `src/shared/types/item.ts` | Add `RawItem`, `RawItemName`, `RawItemsOutput` interfaces |
| `src/apps/craft-calculator/utils/itemData.ts` | Change URL to `/data/items/items.json`; fetch `RawItemsOutput`; iterate `data.items`; remove `LocalizedItemDatabase` import |
| `src/apps/craft-calculator/types/item.ts` | Remove `LocalizedItem`, `LocalizedItemDatabase`, `LocalizedItemName` interfaces (no longer needed) |
| `src/apps/loot-helper/utils/dataLoader.ts` | Change URL to `/data/items/items.json`; adapt array→object with `Object.entries(data.items)`; add `normalizeFoundIn`/`normalizeCraftBench` helpers; refactor `consolidateWeaponTiers` to use `weaponBaseId`/`weaponTier` |
| `src/apps/loot-helper/utils/localization.ts` | Change `getLootHelperItemDescription` to read `item.description` (string) instead of `item.description?.en` |
| `src/apps/loot-helper/types/item.ts` | Change `description` type to `string`; remove `tier`; add optional `weaponBaseId`/`weaponTier` |
| `src/apps/quartermaster/utils/dataLoader.ts` | Change URL to `/data/items/items.json`; add load-time transformations (R5) |
| `src/apps/quartermaster/utils/__tests__/weaponUpgradeData.test.ts` | Update import path to `public/data/items/items.en.json` |
| `package.json` | Replace 3 old scripts with `generate:items` + `generate:hideout`; update `generate` meta-script |
| `scripts/generate-quest-data.sh` | Change item source path from loot-helper to shared items; update jq filter for object format |
| `scripts/generate-embark-inventory-mapping.js` | Change item source path from quartermaster to shared items |
| `AGENTS.md` | Update generation script references and paths |
| `docs/specifications/quartermaster/specification-quartermaster.md` | Update section 3 to reflect shared data model |

### Deleted Files

| File | Reason |
|------|--------|
| `scripts/generate-item-data-craft-calculator.sh` | Replaced by shared `generate-items.ts` |
| `scripts/generate-item-data-loot-helper.sh` | Replaced by shared `generate-items.ts` |
| `scripts/generate-item-data-quartermaster.sh` | Replaced by shared `generate-items.ts` |
| `scripts/quartermaster-import.ts` | Replaced by `generate-items.ts` + `generate-hideout.ts` |
| `public/data/craft-calculator/` (entire dir) | Old output, no longer read |
| `public/data/items-loot-helper.*.json` (all 13+1) | Old output, no longer read |
| `public/data/quartermaster/items.*.json` (all 13+1) | Old output, replaced by `public/data/items/` |

### NOT Modified

| File | Reason |
|------|--------|
| `src/apps/quartermaster/types/item.ts` | `PlannerItem` interface unchanged |
| `src/apps/quartermaster/index.tsx` | Data loading usage unchanged |
| `src/apps/quartermaster/components/` | Components access `ItemsMap` — same type, same API |
| `public/data/quartermaster/hideout.*.json` | Still generated by `generate-hideout.ts` |
| `public/data/quartermaster/projects.*.json` | Separate generator, unchanged |
| `scripts/generate-quartermaster-projects.ts` | Separate generator, unchanged |

---

## Edge Cases & Behavior

| Scenario | Expected Behavior |
|----------|-------------------|
| Item has no `craftBench` | QM loader sets `craftBench: undefined` |
| Item has `craftBench: ["in_raid", "med_station"]` | QM loader removes `"in_raid"`, keeps `"med_station"` |
| Item has `craftBench: ["in_raid"]` (only in_raid) | QM loader sets `craftBench: undefined` |
| Item has `isWeapon: true` with no `upgradesTo` | Shared data has no weapon chain metadata; QM sets `weaponBaseId`/`weaponTier` from shared (undefined) |
| Item has `type: "Outfit"` | Excluded from shared data at generation time — not used by any app |
| Item has `type: "Backpack Charm"` | Excluded from shared data at generation time — not used by any app |
| Item has `type: "Blueprint"` | Included in shared data; excluded by QM loader |
| Weapon chain: `anvil_i → anvil_ii → anvil_iii → anvil_iv` | Shared generator sets `upgradesFrom`, `weaponBaseId: "anvil_i"`, `weaponTier: 1-4` on each |
| Item has `foundIn: "Medical, Residential"` (string) | Preserved in shared data; QM and loot-helper loaders normalize to array |
| Item has `foundIn: ["Medical", "Residential"]` (array) | Used as-is by all apps |
| Loot-helper `consolidateWeaponTiers` with `weaponBaseId` | Grouping by `weaponBaseId` instead of heuristic name stripping produces same groups |
| Loot-helper `consolidateWeaponTiers` with non-weapon items (`weaponBaseId` undefined) | Passed through unmodified |
| Quest generator reads items by ID | Updated jq filter navigates `$items[0].items[$entry.itemId]` instead of array `.map(select(...))` |
| Embark mapping reads items by ID | Uses shared items map — same `items` property structure |
| Old data files still exist on disk after migration | All deleted per R11; git tracks deletion |
| Missing `description` in upstream | Shared generator sets empty string `""` |
| Missing `imageFilename` in upstream | Shared generator sets `""`; QM loader maps to `icon: ""` |
| New upstream field added (e.g., `"maxStack": number`) | Shared generator passes it through automatically via spread; app loaders ignore it |
| Locale file not found for a specific locale | `fetchLocalizedJson` fallback chain handles it (e.g., `pt` → `en`) |

---

## Rollout Strategy

1. **Phase 1** (R1, R2): Create `scripts/generate-items.ts`, add `RawItem` types. Run `npm run generate:items` and verify output.
2. **Phase 2** (R6): Extract `scripts/generate-hideout.ts` from `quartermaster-import.ts`. Run and verify.
3. **Phase 3** (R3): Update craft-calculator loader and types. Run `npm run build` to verify.
4. **Phase 4** (R4): Update loot-helper loader and types. Refactor `consolidateWeaponTiers`. Run `npm run build`.
5. **Phase 5** (R5): Update quartermaster loader with load-time transformations. Run `npm run build`.
6. **Phase 6** (R7, R8, R9, R10): Update quest data generator, embark mapping, package.json, test. Run `npm run generate && npm run build && npm test`.
7. **Phase 7** (R11): Delete old scripts and data files. Run `npm run generate && npm run build && npm test` to confirm everything still works.
8. **Phase 8** (R12): Update AGENTS.md and specification-quartermaster.md.
9. **Final verification**: `npm run generate && npm run build && npm test`
