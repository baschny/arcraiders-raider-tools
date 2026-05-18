#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAPS_SOURCE_PATH = path.resolve(__dirname, '../../arcraiders-data/maps.json');
const OUTPUT_PATH = path.resolve(__dirname, '../public/data/maps/localizations.json');

const MAP_ID_MAP = {
  dam_battlegrounds: 'dam-battleground',
  buried_city: 'buried-city',
  the_spaceport: 'the-spaceport',
  the_blue_gate: 'blue-gate',
  riven_tides: 'riven-tides',
  stella_montis_upper: 'stella-montis',
  stella_montis_lower: 'stella-montis',
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const maps = readJson(MAPS_SOURCE_PATH);
  const localizedMaps = {};

  for (const map of maps) {
    const normalizedMapId = MAP_ID_MAP[map.id];
    if (!normalizedMapId) {
      continue;
    }

    localizedMaps[normalizedMapId] = {
      localizations: {
        ...(localizedMaps[normalizedMapId]?.localizations ?? {}),
        ...(map.name ?? {}),
      },
    };
  }

  const output = {
    _readme: {
      description: 'Map name localizations extracted from ../arcraiders-data/maps.json',
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      source: '../arcraiders-data/maps.json',
    },
    maps: localizedMaps,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`✓ Generated ${OUTPUT_PATH}`);
  console.log(`  Maps: ${Object.keys(localizedMaps).length}`);
}

main();
