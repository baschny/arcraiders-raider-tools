#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAPS_SOURCE_PATH = path.resolve(__dirname, '../../arcraiders-data/maps.json');
const MAP_EVENTS_SOURCE_PATH = path.resolve(__dirname, '../../arcraiders-data/map-events/map-events.json');
const OUTPUT_PATH = path.resolve(__dirname, '../public/data/schedule/localizations.json');

const MAP_ID_MAP = {
  dam_battlegrounds: 'dam-battleground',
  buried_city: 'buried-city',
  the_spaceport: 'the-spaceport',
  the_blue_gate: 'blue-gate',
  stella_montis_upper: 'stella-montis',
  stella_montis_lower: 'stella-montis',
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function mergeLocalizedStrings(target = {}, source = {}) {
  return { ...target, ...source };
}

function main() {
  const maps = readJson(MAPS_SOURCE_PATH);
  const mapEvents = readJson(MAP_EVENTS_SOURCE_PATH);

  const localizedMaps = {};

  for (const map of maps) {
    const normalizedMapId = MAP_ID_MAP[map.id];
    if (!normalizedMapId) {
      continue;
    }

    localizedMaps[normalizedMapId] = {
      localizations: mergeLocalizedStrings(
        localizedMaps[normalizedMapId]?.localizations,
        map.name ?? {}
      ),
    };
  }

  const localizedEventTypes = Object.fromEntries(
    Object.entries(mapEvents.eventTypes ?? {}).map(([eventId, eventType]) => [
      eventId,
      {
        localizations: eventType.localizations ?? { en: eventType.displayName },
      },
    ])
  );

  const output = {
    _readme: {
      description:
        'Schedule localization metadata extracted from ../arcraiders-data maps.json and map-events/map-events.json',
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      sources: {
        maps: '../arcraiders-data/maps.json',
        mapEvents: '../arcraiders-data/map-events/map-events.json',
      },
    },
    maps: localizedMaps,
    eventTypes: localizedEventTypes,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`✓ Generated ${OUTPUT_PATH}`);
  console.log(`  Maps: ${Object.keys(localizedMaps).length}`);
  console.log(`  Event types: ${Object.keys(localizedEventTypes).length}`);
}

main();
