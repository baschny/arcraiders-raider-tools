#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCENARIOS_PATH = path.resolve(__dirname, '../../embark-api/data/scenarios.json');
const MAP_EVENTS_PATH = path.resolve(__dirname, '../../embark-api/data/arctracker-map-events.json');
const MAPS_PATH = path.resolve(__dirname, '../../embark-api/data/arctracker-maps.json');
const LEGACY_MAP_EVENTS_PATH = path.resolve(
  __dirname,
  '../../arcraiders-data/map-events/map-events.json'
);
const OUTPUT_PATH = path.resolve(__dirname, '../public/data/schedule/map-events.json');

const MAP_ORDER = [
  'dam-battleground',
  'buried-city',
  'the-spaceport',
  'blue-gate',
  'stella-montis',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toCamelCaseFromKebab(value) {
  return value.replace(/-([a-z])/g, (_match, char) => char.toUpperCase());
}

function parseConditionAssetInteger(value) {
  const match = String(value ?? '').match(/^(-?\d+)/);
  return match ? match[1] : null;
}

function parseStartTimestamp(value) {
  const match = String(value ?? '').match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

function parseConditionInfo(label) {
  const normalized = String(label ?? '').trim();
  const majorMatch = normalized.match(/^Major:\s*(.+)$/i);
  if (majorMatch) {
    return { category: 'major', displayName: majorMatch[1].trim() };
  }

  const minorMatch = normalized.match(/^Minor:\s*(.+)$/i);
  if (minorMatch) {
    return { category: 'minor', displayName: minorMatch[1].trim() };
  }

  return null;
}

function canonicalizeMapId(rawMapId) {
  const withHyphens = String(rawMapId ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');

  if (withHyphens === 'dam-battlegrounds') {
    return 'dam-battleground';
  }

  if (withHyphens === 'the-blue-gate') {
    return 'blue-gate';
  }

  return withHyphens;
}

function sortNumericKeyedRecord(record) {
  return Object.fromEntries(
    Object.entries(record).sort((a, b) => Number(a[0]) - Number(b[0]))
  );
}

function sortMapIds(mapIds) {
  return [...mapIds].sort((a, b) => {
    const aIndex = MAP_ORDER.indexOf(a);
    const bIndex = MAP_ORDER.indexOf(b);
    const aRank = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const bRank = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;

    if (aRank !== bRank) {
      return aRank - bRank;
    }

    return a.localeCompare(b);
  });
}

function main() {
  const scenariosData = readJson(SCENARIOS_PATH);
  const mapEventsMapping = readJson(MAP_EVENTS_PATH);
  const mapsMapping = readJson(MAPS_PATH);
  const legacyMapEventsData = readJson(LEGACY_MAP_EVENTS_PATH);
  const legacyEventTypes = legacyMapEventsData?.eventTypes ?? {};

  const mapByInternalName = new Map();
  const discoveredMaps = {};

  Object.values(mapsMapping).forEach((mapEntry) => {
    const internalName = mapEntry?.internalName;
    if (!internalName) {
      return;
    }

    const mapId = canonicalizeMapId(mapEntry.id ?? mapEntry.name);
    const displayName = String(mapEntry.name ?? mapId).trim();
    mapByInternalName.set(internalName, { mapId, displayName });
    discoveredMaps[mapId] = { displayName };
  });

  const schedule = {};
  const eventTypes = {};
  const missingConditionIds = new Set();
  let minTimestamp = Number.POSITIVE_INFINITY;
  let maxTimestamp = Number.NEGATIVE_INFINITY;
  let includedConditionCount = 0;

  const scenarios = Array.isArray(scenariosData.matchmakingScenarios)
    ? scenariosData.matchmakingScenarios
    : [];

  scenarios.forEach((scenario) => {
    const internalMapName = scenario?.parameters?.mapName;
    const mapInfo = mapByInternalName.get(internalMapName);
    if (!mapInfo) {
      return;
    }

    if (!schedule[mapInfo.mapId]) {
      schedule[mapInfo.mapId] = { major: {}, minor: {} };
    }

    const conditions = scenario?.pioneerSettings?.mapConditions?.conditionSettings;
    if (!Array.isArray(conditions)) {
      return;
    }

    conditions.forEach((condition) => {
      const conditionId = parseConditionAssetInteger(condition?.conditionAssetId);
      if (!conditionId) {
        return;
      }

      const conditionMapping = mapEventsMapping[conditionId];
      if (!conditionMapping) {
        missingConditionIds.add(conditionId);
        return;
      }

      const fallbackLabel = String(condition.conditionAssetId)
        .replace(/^-?\d+\s*/, '')
        .trim();
      const parsedInfo =
        parseConditionInfo(conditionMapping.name) ?? parseConditionInfo(fallbackLabel);

      if (!parsedInfo) {
        return;
      }

      const startTimestamp = parseStartTimestamp(condition?.startTime);
      if (!Number.isFinite(startTimestamp)) {
        return;
      }

      const eventId = slugify(parsedInfo.displayName);
      if (!eventId) {
        return;
      }

      const timestampKey = String(startTimestamp);
      schedule[mapInfo.mapId][parsedInfo.category][timestampKey] = eventId;

      if (!eventTypes[eventId]) {
        const legacyEvent = legacyEventTypes[eventId];
        const localizations =
          legacyEvent && typeof legacyEvent === 'object' && legacyEvent.localizations
            ? legacyEvent.localizations
            : { en: parsedInfo.displayName };
        eventTypes[eventId] = {
          displayName: parsedInfo.displayName,
          icon: `https://cdn.arctracker.io/map-events/${eventId.replace(/-/g, '_')}.png`,
          translationKey: toCamelCaseFromKebab(eventId),
          category: parsedInfo.category,
          localizations,
        };
      }

      const durationSeconds = Number(condition?.durationInSecond);
      const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0
        ? durationSeconds
        : 3600;

      minTimestamp = Math.min(minTimestamp, startTimestamp);
      maxTimestamp = Math.max(maxTimestamp, startTimestamp + safeDuration);
      includedConditionCount += 1;
    });
  });

  const sortedMapIds = sortMapIds(Object.keys(schedule));
  const sortedMaps = {};
  const sortedSchedule = {};

  sortedMapIds.forEach((mapId) => {
    sortedMaps[mapId] = discoveredMaps[mapId] ?? { displayName: mapId };
    sortedSchedule[mapId] = {
      major: sortNumericKeyedRecord(schedule[mapId].major),
      minor: sortNumericKeyedRecord(schedule[mapId].minor),
    };
  });

  const sortedEventTypes = Object.fromEntries(
    Object.entries(eventTypes).sort((a, b) => {
      if (a[1].category !== b[1].category) {
        return a[1].category === 'major' ? -1 : 1;
      }
      return a[1].displayName.localeCompare(b[1].displayName);
    })
  );

  const output = {
    _readme: {
      description: 'Map events schedule for ARC Raiders generated from embark-api scenarios',
      format:
        'Schedule keys are UNIX timestamps (seconds, UTC) at event start; values are event type ids.',
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      sourceFiles: {
        scenarios: '../embark-api/data/scenarios.json',
        mapEvents: '../embark-api/data/arctracker-map-events.json',
        maps: '../embark-api/data/arctracker-maps.json',
        localizations: '../arcraiders-data/map-events/map-events.json',
      },
      timestampRange: {
        start: Number.isFinite(minTimestamp) ? minTimestamp : null,
        end: Number.isFinite(maxTimestamp) ? maxTimestamp : null,
      },
      ignoredConditionIds: Array.from(missingConditionIds).sort((a, b) => Number(a) - Number(b)),
    },
    eventTypes: sortedEventTypes,
    maps: sortedMaps,
    schedule: sortedSchedule,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`✓ Generated ${OUTPUT_PATH}`);
  console.log(`  Scenarios processed: ${scenarios.length}`);
  console.log(`  Maps included: ${sortedMapIds.length}`);
  console.log(`  Event types included: ${Object.keys(sortedEventTypes).length}`);
  console.log(`  Conditions included: ${includedConditionCount}`);
  console.log(
    `  Ignored condition IDs without mapping: ${
      output.metadata.ignoredConditionIds.length > 0
        ? output.metadata.ignoredConditionIds.join(', ')
        : 'none'
    }`
  );
}

main();
