#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const embarkRoot = path.resolve(repoRoot, process.env.EMBARK_API_ROOT ?? '../embark-api');
const embarkData = path.join(embarkRoot, 'data');
const embarkMappings = path.join(embarkRoot, 'arcraiders-api-mapping');
const outputPath = path.join(repoRoot, 'infra/lambda/data/embark-inventory-mapping.json');
const sharedItemsPath = path.join(repoRoot, 'public/data/items/items.en.json');

const sourceFiles = {
  arctrackerItems: path.join(embarkData, 'arctracker-items.json'),
  arctrackerItemsUnknown: path.join(embarkData, 'arctracker-items-unknown.json'),
  arctrackerStructures: path.join(embarkData, 'arctracker-structures.json'),
  arctrackerBlueprints: path.join(embarkData, 'arctracker-blueprints.json'),
  arctrackerBenches: path.join(embarkData, 'arctracker-benches.json'),
  arctrackerChambers: path.join(embarkData, 'arctracker-chambers.json'),
  arctrackerCurrencies: path.join(embarkData, 'arctracker-currencies.json'),
  augmentLoadouts: path.join(embarkMappings, 'augment-loadout-mapping.json'),
  blueprintMapping: path.join(embarkMappings, 'blueprint-mapping.json'),
  hideoutMapping: path.join(embarkMappings, 'hideout-mapping.json'),
  embarkConstants: path.join(embarkMappings, 'embark-constants.json'),
  quartermasterItems: sharedItemsPath,
};

function readJson(filePath, required = true) {
  if (!fs.existsSync(filePath)) {
    if (!required) return {};
    throw new Error(`Required mapping file missing: ${path.relative(repoRoot, filePath)}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([key, nested]) => [key, sortObject(nested)]),
  );
}

function addMapping(target, key, value, label) {
  if (key === undefined || key === null || value === undefined || value === null || value === '') return;
  const stringKey = String(key);
  const stringValue = String(value);
  const existing = target[stringKey];
  if (existing && existing !== stringValue) {
    throw new Error(`Conflicting ${label} mapping for ${stringKey}: ${existing} vs ${stringValue}`);
  }
  target[stringKey] = stringValue;
}

function stripBlueprintSuffix(itemId) {
  return itemId.endsWith('_blueprint') ? itemId.slice(0, -'_blueprint'.length) : itemId;
}

function resolveBlueprintTargetItemId(blueprintItemId, sharedItems) {
  const base = stripBlueprintSuffix(blueprintItemId);
  const candidates = [
    base,
    `${base}_i`,
    base.replace(/_mk3_/, '_mk_3_'),
  ];

  for (const candidate of candidates) {
    if (sharedItems[candidate]) return candidate;
  }
  return candidates[0];
}

function main() {
  if (!fs.existsSync(embarkRoot)) {
    throw new Error(`Embark API root missing: ${embarkRoot}`);
  }

  const arctrackerItems = readJson(sourceFiles.arctrackerItems);
  const arctrackerItemsUnknown = readJson(sourceFiles.arctrackerItemsUnknown, false);
  const arctrackerStructures = readJson(sourceFiles.arctrackerStructures);
  const arctrackerBlueprints = readJson(sourceFiles.arctrackerBlueprints);
  const arctrackerBenches = readJson(sourceFiles.arctrackerBenches);
  const arctrackerChambers = readJson(sourceFiles.arctrackerChambers);
  const arctrackerCurrencies = readJson(sourceFiles.arctrackerCurrencies);
  const augmentLoadouts = readJson(sourceFiles.augmentLoadouts);
  const blueprintMapping = readJson(sourceFiles.blueprintMapping);
  const hideoutMapping = readJson(sourceFiles.hideoutMapping);
  const embarkConstants = readJson(sourceFiles.embarkConstants, false);
  const sharedItems = readJson(sourceFiles.quartermasterItems).items ?? {};

  const gameAssetIdToItemId = {};
  const gameAssetIdToItemName = {};
  const structureNames = {};

  for (const [assetId, item] of Object.entries({
    ...arctrackerItems,
    ...arctrackerItemsUnknown,
    ...arctrackerCurrencies,
  })) {
    addMapping(gameAssetIdToItemId, assetId, item.id, 'item id');
    if (item.name) addMapping(gameAssetIdToItemName, assetId, item.name, 'item name');
  }

  for (const [assetId, item] of Object.entries(arctrackerBlueprints)) {
    if (item.blueprintAssetId) {
      const blueprintItem = arctrackerItems[String(item.blueprintAssetId)];
      if (blueprintItem?.id) {
        addMapping(gameAssetIdToItemId, assetId, blueprintItem.id, 'blueprint item id');
      }
    }
    if (item.name) addMapping(gameAssetIdToItemName, assetId, item.name, 'blueprint name');
  }

  for (const [assetId, structure] of Object.entries({
    ...arctrackerStructures,
    ...arctrackerChambers,
  })) {
    const name = structure.name ?? structure.assetIndex?.name;
    if (name) addMapping(structureNames, assetId, name, 'structure name');
  }

  const blueprintUnlocksByTokenAssetId = {};
  for (const [tokenAssetId, blueprintItemId] of Object.entries(blueprintMapping)) {
    const blueprintInfo = arctrackerBlueprints[tokenAssetId] ?? {};
    blueprintUnlocksByTokenAssetId[tokenAssetId] = {
      targetItemId: resolveBlueprintTargetItemId(String(blueprintItemId), sharedItems),
      blueprintAssetId: blueprintInfo.blueprintAssetId ? Number(blueprintInfo.blueprintAssetId) : undefined,
      name: blueprintInfo.name ?? undefined,
    };
  }

  const hideoutBenchLevelsByGeneratorAssetId = {};
  const assetIdToHideout = hideoutMapping.assetIdToHideout ?? {};
  const benchDefs = hideoutMapping.benches ?? {};
  for (const [assetId, ref] of Object.entries(assetIdToHideout)) {
    if (ref.module === 'stash') continue;
    const bench = benchDefs[ref.module];
    hideoutBenchLevelsByGeneratorAssetId[assetId] = {
      moduleId: ref.module,
      currentLevel: Number(ref.level),
      maxLevel: Number(bench?.maxLevel ?? ref.level),
      name: arctrackerBenches[assetId]?.name ?? bench?.name,
    };
  }

  const augmentLoadoutsByAugmentAssetId = {};
  for (const [assetId, augment] of Object.entries(augmentLoadouts.augments ?? {})) {
    augmentLoadoutsByAugmentAssetId[assetId] = {
      loadoutFrameAssetId: Number(augment.loadoutContainerAssetId),
      backpackSlots: Number(augment.backpackSlots ?? 0),
      quickUseSlots: Number(augment.quickItemSlots ?? 0),
      safePocketSlots: Number(augment.safePocketSlots ?? 0),
      auxiliarySlots: Number(augment.augmentedSlots ?? 0),
      name: augment.name,
    };
  }

  const constants = {
    inventoryRootAssetId: 1173010504,
    currentAugmentAssetId: 129937576,
    regularItemSlotAssetId: 1440007245,
    weaponSlotAssetId: -620731692,
    quickUseSlotAssetId: -1277506061,
    safePocketSlotAssetId: -3680536,
    meleeSlotAssetId: -666604429,
    workshopRootAssetId: -1264657974,
    workshopBenchSlotAssetId: 407,
    mainStashRootAssetId: -2121050171,
    extraStashRootAssetId: -205714511,
    loadoutFrameSlotAssetId: -1379879497,
    ...Object.fromEntries(
      Object.entries(embarkConstants.constants ?? {})
        .filter(([, value]) => typeof value === 'number'),
    ),
  };

  const requiredCounts = {
    gameAssetIdToItemId,
    structureNames,
    blueprintUnlocksByTokenAssetId,
    hideoutBenchLevelsByGeneratorAssetId,
    augmentLoadoutsByAugmentAssetId,
  };
  for (const [name, value] of Object.entries(requiredCounts)) {
    if (Object.keys(value).length === 0) {
      throw new Error(`Generated ${name} is empty`);
    }
  }

  for (const [name, value] of Object.entries(constants)) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new Error(`Required constant ${name} could not be resolved`);
    }
  }

  const output = sortObject({
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceRoot: path.relative(repoRoot, embarkRoot),
    sources: Object.fromEntries(
      Object.entries(sourceFiles)
        .filter(([, filePath]) => fs.existsSync(filePath))
        .map(([name, filePath]) => [name, path.relative(repoRoot, filePath)]),
    ),
    gameAssetIdToItemId,
    gameAssetIdToItemName,
    structureNames,
    blueprintUnlocksByTokenAssetId,
    hideoutBenchLevelsByGeneratorAssetId,
    augmentLoadoutsByAugmentAssetId,
    constants,
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  console.log('Generated Embark inventory mapping');
  console.log(`  item mappings: ${Object.keys(gameAssetIdToItemId).length}`);
  console.log(`  structure mappings: ${Object.keys(structureNames).length}`);
  console.log(`  blueprint unlock mappings: ${Object.keys(blueprintUnlocksByTokenAssetId).length}`);
  console.log(`  hideout bench mappings: ${Object.keys(hideoutBenchLevelsByGeneratorAssetId).length}`);
  console.log(`  augment mappings: ${Object.keys(augmentLoadoutsByAugmentAssetId).length}`);
  console.log(`  unknown item mappings included: ${Object.keys(arctrackerItemsUnknown).length}`);
  console.log(`  output: ${path.relative(repoRoot, outputPath)}`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
