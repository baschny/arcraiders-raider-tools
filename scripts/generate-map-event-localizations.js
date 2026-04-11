#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAP_EVENTS_SOURCE_PATH = path.resolve(__dirname, '../../arcraiders-data/map-events/map-events.json');
const OUTPUT_PATH = path.resolve(__dirname, '../public/data/map-events/localizations.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const mapEvents = readJson(MAP_EVENTS_SOURCE_PATH);

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
        'Map event name localizations extracted from ../arcraiders-data/map-events/map-events.json',
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      source: '../arcraiders-data/map-events/map-events.json',
    },
    eventTypes: localizedEventTypes,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`✓ Generated ${OUTPUT_PATH}`);
  console.log(`  Event types: ${Object.keys(localizedEventTypes).length}`);
}

main();
