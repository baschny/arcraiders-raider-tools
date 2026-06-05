#!/usr/bin/env npx tsx

/**
 * Hideout Module Generator
 *
 * Reads hideout JSON files from ../arcraiders-data/hideout/ and generates
 * locale-specific files at public/data/quartermaster/hideout.<locale>.json
 *
 * Extracted from scripts/quartermaster-import.ts
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

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

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
// Hideout generation
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

interface ArctrackerBench {
  id: string;
  level: number;
  assetIndex?: {
    id?: string;
  };
}

interface HideoutModuleOutput {
  id: string;
  name: {
    value: string;
    originalEn: string;
  };
  maxLevel: number;
  levels: {
    level: number;
    image: string | null;
    requirementItemIds: { itemId: string; quantity: number }[];
  }[];
}

function loadHideoutBenchImages(scriptDir: string): Map<string, string | null> {
  const mappingFile = path.resolve(scriptDir, '../../embark-api/data/arctracker-benches.json');
  const imageSourceDir = path.resolve(scriptDir, '../../embark-api/asset-index/images');
  const imageDestDir = path.resolve(scriptDir, '../public/images/benches');
  const imageByBenchLevel = new Map<string, string | null>();

  if (!fs.existsSync(mappingFile)) {
    console.warn(`Warning: Hideout bench mapping file does not exist: ${mappingFile}`);
    return imageByBenchLevel;
  }

  if (!fs.existsSync(imageDestDir)) {
    fs.mkdirSync(imageDestDir, { recursive: true });
  }

  const benchRecords = Object.values(
    JSON.parse(fs.readFileSync(mappingFile, 'utf-8')) as Record<string, ArctrackerBench>,
  );

  for (const bench of benchRecords) {
    const assetId = bench.assetIndex?.id;
    const key = `${bench.id}:${bench.level}`;

    if (!assetId) {
      imageByBenchLevel.set(key, null);
      continue;
    }

    const sourceFile = path.join(imageSourceDir, `${assetId}.png`);
    if (!fs.existsSync(sourceFile)) {
      imageByBenchLevel.set(key, null);
      continue;
    }

    const fileName = `${bench.id}-tier${bench.level}.png`;
    const destFile = path.join(imageDestDir, fileName);
    fs.copyFileSync(sourceFile, destFile);
    imageByBenchLevel.set(key, `/images/benches/${fileName}`);
  }

  return imageByBenchLevel;
}

function generateHideoutData(scriptDir: string, locale: OutputLocale): void {
  const sourceDir = path.resolve(scriptDir, '../../arcraiders-data/hideout');
  const destFile = path.resolve(scriptDir, `../public/data/quartermaster/hideout.${locale}.json`);
  const benchImages = loadHideoutBenchImages(scriptDir);

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
        name: {
          value: getLocalizedValue(source.name, locale),
          originalEn: source.name.en,
        },
        maxLevel: source.maxLevel,
        levels: source.levels.map(level => ({
          level: level.level,
          image: benchImages.get(`${source.id}:${level.level}`) ?? null,
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
  console.log(`  Modules (${locale}): ${modules.length}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const scriptPath = path.resolve(process.argv[1] ?? './scripts/generate-hideout.ts');
  const scriptDir = path.dirname(scriptPath);

  for (const locale of LOCALES) {
    generateHideoutData(scriptDir, locale);
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
