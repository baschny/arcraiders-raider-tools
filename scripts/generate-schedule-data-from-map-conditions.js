#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAP_CONDITIONS_URL = 'https://arcraiders.com/map-conditions';
const EVENT_TYPES_PATH = path.resolve(__dirname, '../public/data/schedule/event-types.json');
const OUTPUT_PATH = path.resolve(__dirname, '../public/data/schedule/map-events.json');

const MAP_ORDER = [
  'dam-battleground',
  'buried-city',
  'the-spaceport',
  'blue-gate',
  'riven-tides',
  'stella-montis',
];
const MERGE_HISTORY_WINDOW_SECONDS = 30 * 24 * 60 * 60;
const CHANGE_REPORT_PREVIEW_LIMIT = 12;
const FETCH_TIMEOUT_MS = 20_000;

const REGIONS = [
  { id: 'europe', displayName: 'Europe', shortCode: 'EU', color: '#c46a6a' },
  { id: 'north-america', displayName: 'North America', shortCode: 'NA', color: '#5b8bd4' },
  { id: 'south-america', displayName: 'South America', shortCode: 'SA', color: '#6fae7a' },
  { id: 'asia', displayName: 'Asia', shortCode: 'AS', color: '#a06bb8' },
  { id: 'oceania', displayName: 'Oceania', shortCode: 'OC', color: '#4ba3a3' },
];
const REGION_ORDER = REGIONS.map((region) => region.id);
// upstream regionTimestamps keys -> canonical region id (europe uses top-level start/end)
const REGION_ID_BY_UPSTREAM_KEY = {
  'north-america': 'north-america',
  brazil: 'south-america',
  'east-asia': 'asia',
  oceania: 'oceania',
};
const REGION_BY_ID = Object.fromEntries(REGIONS.map((region) => [region.id, region]));

const KNOWN_MAP_ID_BY_DISPLAY_NAME = {
  'Buried City': 'buried-city',
  'Dam Battlegrounds': 'dam-battleground',
  Spaceport: 'the-spaceport',
  'Stella Montis': 'stella-montis',
  'The Blue Gate': 'blue-gate',
  'Riven Tides': 'riven-tides',
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return readJson(filePath);
  } catch (error) {
    console.warn(`Warning: Failed to parse existing schedule at ${filePath}: ${error.message}`);
    return null;
  }
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toCamelCaseFromKebab(value) {
  return value.replace(/-([a-z])/g, (_match, char) => char.toUpperCase());
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

  if (withHyphens === 'spaceport') {
    return 'the-spaceport';
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

function ensureRegionScheduleMap(schedule, regionId, mapId) {
  if (!schedule[regionId]) {
    schedule[regionId] = {};
  }

  if (!schedule[regionId][mapId]) {
    schedule[regionId][mapId] = { major: {}, minor: {} };
  }

  return schedule[regionId][mapId];
}

function toDisplayNameFromEventId(eventId) {
  return String(eventId)
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function collectTimestampRange(schedule, fallbackEndTimestamp) {
  let minTimestamp = Number.POSITIVE_INFINITY;
  let maxTimestamp = Number.NEGATIVE_INFINITY;

  Object.values(schedule).forEach((regionSchedule) => {
    Object.values(regionSchedule ?? {}).forEach((mapSchedule) => {
      ['major', 'minor'].forEach((category) => {
        Object.keys(mapSchedule?.[category] ?? {}).forEach((timestampKey) => {
          const timestamp = Number(timestampKey);
          if (Number.isFinite(timestamp)) {
            minTimestamp = Math.min(minTimestamp, timestamp);
            maxTimestamp = Math.max(maxTimestamp, timestamp + 3600);
          }
        });
      });
    });
  });

  if (!Number.isFinite(minTimestamp)) {
    return {
      start: null,
      end: Number.isFinite(fallbackEndTimestamp) ? fallbackEndTimestamp : null,
    };
  }

  const end = Number.isFinite(fallbackEndTimestamp)
    ? Math.max(fallbackEndTimestamp, maxTimestamp)
    : maxTimestamp;

  return {
    start: minTimestamp,
    end,
  };
}

function flattenScheduleEntries(schedule, minTimestampInclusive) {
  const entries = [];

  Object.entries(schedule ?? {}).forEach(([regionId, regionSchedule]) => {
    Object.entries(regionSchedule ?? {}).forEach(([mapId, mapSchedule]) => {
      ['major', 'minor'].forEach((category) => {
        Object.entries(mapSchedule?.[category] ?? {}).forEach(([timestampKey, eventId]) => {
          const timestamp = Number(timestampKey);
          if (!Number.isFinite(timestamp) || timestamp < minTimestampInclusive) {
            return;
          }

          entries.push({
            regionId,
            mapId,
            category,
            timestamp,
            eventId: String(eventId),
            key: `${regionId}|${mapId}|${category}|${timestamp}`,
          });
        });
      });
    });
  });

  return entries;
}

function formatUtcTimestamp(timestamp) {
  return new Date(timestamp * 1000).toISOString().replace('.000Z', 'Z');
}

function sortScheduleEntry(a, b) {
  if (a.regionId !== b.regionId) {
    return a.regionId.localeCompare(b.regionId);
  }

  if (a.mapId !== b.mapId) {
    return a.mapId.localeCompare(b.mapId);
  }

  if (a.category !== b.category) {
    return a.category.localeCompare(b.category);
  }

  if (a.timestamp !== b.timestamp) {
    return a.timestamp - b.timestamp;
  }

  return a.eventId.localeCompare(b.eventId);
}

function summarizeFutureScheduleChanges(previousSchedule, nextSchedule, nowUnix) {
  const previousEntries = flattenScheduleEntries(previousSchedule, nowUnix);
  const nextEntries = flattenScheduleEntries(nextSchedule, nowUnix);

  const previousByKey = new Map(previousEntries.map((entry) => [entry.key, entry]));
  const nextByKey = new Map(nextEntries.map((entry) => [entry.key, entry]));

  const rawAdded = [];
  const rawRemoved = [];
  const replaced = [];

  previousByKey.forEach((previousEntry, key) => {
    const nextEntry = nextByKey.get(key);
    if (!nextEntry) {
      rawRemoved.push(previousEntry);
      return;
    }

    if (nextEntry.eventId !== previousEntry.eventId) {
      replaced.push({
        regionId: previousEntry.regionId,
        mapId: previousEntry.mapId,
        category: previousEntry.category,
        timestamp: previousEntry.timestamp,
        fromEventId: previousEntry.eventId,
        toEventId: nextEntry.eventId,
      });
      rawRemoved.push(previousEntry);
      rawAdded.push(nextEntry);
    }
  });

  nextByKey.forEach((nextEntry, key) => {
    if (!previousByKey.has(key)) {
      rawAdded.push(nextEntry);
    }
  });

  const additionsByGroup = new Map();
  const removalsByGroup = new Map();

  rawAdded.forEach((entry) => {
    const groupKey = `${entry.regionId}|${entry.mapId}|${entry.category}|${entry.eventId}`;
    const group = additionsByGroup.get(groupKey) ?? [];
    group.push(entry);
    additionsByGroup.set(groupKey, group);
  });

  rawRemoved.forEach((entry) => {
    const groupKey = `${entry.regionId}|${entry.mapId}|${entry.category}|${entry.eventId}`;
    const group = removalsByGroup.get(groupKey) ?? [];
    group.push(entry);
    removalsByGroup.set(groupKey, group);
  });

  const moved = [];
  const added = [];
  const removed = [];

  const allGroups = new Set([...additionsByGroup.keys(), ...removalsByGroup.keys()]);
  allGroups.forEach((groupKey) => {
    const groupedAdded = [...(additionsByGroup.get(groupKey) ?? [])].sort((a, b) => a.timestamp - b.timestamp);
    const groupedRemoved = [...(removalsByGroup.get(groupKey) ?? [])].sort((a, b) => a.timestamp - b.timestamp);

    const moveCount = Math.min(groupedAdded.length, groupedRemoved.length);
    for (let index = 0; index < moveCount; index += 1) {
      moved.push({
        mapId: groupedAdded[index].mapId,
        category: groupedAdded[index].category,
        eventId: groupedAdded[index].eventId,
        fromTimestamp: groupedRemoved[index].timestamp,
        toTimestamp: groupedAdded[index].timestamp,
      });
    }

    groupedRemoved.slice(moveCount).forEach((entry) => removed.push(entry));
    groupedAdded.slice(moveCount).forEach((entry) => added.push(entry));
  });

  moved.sort((a, b) => {
    if (a.regionId !== b.regionId) {
      return a.regionId.localeCompare(b.regionId);
    }
    if (a.mapId !== b.mapId) {
      return a.mapId.localeCompare(b.mapId);
    }
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    if (a.fromTimestamp !== b.fromTimestamp) {
      return a.fromTimestamp - b.fromTimestamp;
    }
    if (a.toTimestamp !== b.toTimestamp) {
      return a.toTimestamp - b.toTimestamp;
    }
    return a.eventId.localeCompare(b.eventId);
  });

  replaced.sort((a, b) => {
    if (a.regionId !== b.regionId) {
      return a.regionId.localeCompare(b.regionId);
    }
    if (a.mapId !== b.mapId) {
      return a.mapId.localeCompare(b.mapId);
    }
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.timestamp - b.timestamp;
  });

  return {
    added: added.sort(sortScheduleEntry),
    removed: removed.sort(sortScheduleEntry),
    moved,
    replaced,
  };
}

function printPreviewLines(items, formatter, label) {
  if (items.length === 0) {
    return;
  }

  console.log(`  ${label}: ${items.length}`);
  items.slice(0, CHANGE_REPORT_PREVIEW_LIMIT).forEach((item) => {
    console.log(`    - ${formatter(item)}`);
  });

  if (items.length > CHANGE_REPORT_PREVIEW_LIMIT) {
    console.log(`    ... and ${items.length - CHANGE_REPORT_PREVIEW_LIMIT} more`);
  }
}

function printFutureScheduleChangeReport(changes) {
  if (!changes) {
    console.log('  Future schedule changes vs previous run: unavailable (no previous schedule)');
    return;
  }

  const totalChanges =
    changes.added.length + changes.removed.length + changes.moved.length + changes.replaced.length;
  console.log(
    `  Future schedule changes vs previous run: ${totalChanges} ` +
      `(added ${changes.added.length}, removed ${changes.removed.length}, moved ${changes.moved.length}, replaced ${changes.replaced.length})`
  );

  printPreviewLines(
    changes.added,
    (entry) =>
      `${entry.regionId}/${entry.mapId}/${entry.category} ${formatUtcTimestamp(entry.timestamp)} -> ${entry.eventId}`,
    'Added future events'
  );

  printPreviewLines(
    changes.removed,
    (entry) =>
      `${entry.regionId}/${entry.mapId}/${entry.category} ${formatUtcTimestamp(entry.timestamp)} -> ${entry.eventId}`,
    'Removed future events'
  );

  printPreviewLines(
    changes.moved,
    (entry) =>
      `${entry.regionId}/${entry.mapId}/${entry.category} ${entry.eventId}: ${formatUtcTimestamp(entry.fromTimestamp)} -> ${formatUtcTimestamp(entry.toTimestamp)}`,
    'Moved future events'
  );

  printPreviewLines(
    changes.replaced,
    (entry) =>
      `${entry.regionId}/${entry.mapId}/${entry.category} ${formatUtcTimestamp(entry.timestamp)}: ${entry.fromEventId} -> ${entry.toEventId}`,
    'Replaced future events at same timestamp'
  );
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'raider-tools-map-events/1.0',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function extractEscapedJsonArray(document, escapedToken) {
  const tokenIndex = document.indexOf(escapedToken);
  if (tokenIndex === -1) {
    return null;
  }

  const startIndex = document.indexOf('[', tokenIndex + escapedToken.length);
  if (startIndex === -1) {
    return null;
  }

  let depth = 0;
  for (let index = startIndex; index < document.length; index += 1) {
    const char = document[index];
    if (char === '[') {
      depth += 1;
      continue;
    }

    if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        const rawEscaped = document.slice(startIndex, index + 1);
        const jsonText = rawEscaped.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        try {
          return JSON.parse(jsonText);
        } catch (error) {
          throw new Error(`Failed to parse token ${escapedToken}: ${error.message}`);
        }
      }
    }
  }

  return null;
}

function normalizeMapDisplayName(value) {
  return String(value ?? '').trim();
}

function resolveMapId(mapDisplayName, mapIdByDisplayName) {
  const normalizedDisplayName = normalizeMapDisplayName(mapDisplayName);
  if (!normalizedDisplayName) {
    return null;
  }

  if (KNOWN_MAP_ID_BY_DISPLAY_NAME[normalizedDisplayName]) {
    return KNOWN_MAP_ID_BY_DISPLAY_NAME[normalizedDisplayName];
  }

  const existingMapId = mapIdByDisplayName.get(normalizedDisplayName.toLowerCase());
  if (existingMapId) {
    return existingMapId;
  }

  return canonicalizeMapId(slugify(normalizedDisplayName));
}

async function collectMapConditionEntries() {
  const overviewHtml = await fetchText(MAP_CONDITIONS_URL);
  const conditionItems =
    extractEscapedJsonArray(overviewHtml, '\\\"conditionItems\\\":') ?? [];
  const liveEntries =
    extractEscapedJsonArray(overviewHtml, '\\\"liveEntries\\\":') ?? [];

  const conditionTypesByName = new Map();
  conditionItems.forEach((conditionItem) => {
    const name = String(conditionItem?.name ?? '').trim();
    const type = String(conditionItem?.type ?? '').trim().toLowerCase();
    if (!name || !['major', 'minor'].includes(type)) {
      return;
    }

    conditionTypesByName.set(name, type);
  });

  const conditionEntries = [];
  liveEntries.forEach((entry) => {
    const entryConditionName = String(entry?.conditionName ?? '').trim();
    const resolvedCategory = conditionTypesByName.get(entryConditionName);
    if (!resolvedCategory) {
      return;
    }

    conditionEntries.push({
      conditionName: entryConditionName,
      mapDisplayName: String(entry?.mapDisplayName ?? '').trim(),
      startTimestampMs: Number(entry?.startTimestamp),
      endTimestampMs: Number(entry?.endTimestamp),
      durationInSeconds: Number(entry?.durationInSeconds),
      category: resolvedCategory,
      regionTimestamps: entry?.regionTimestamps ?? {},
      sourcePage: MAP_CONDITIONS_URL,
    });
  });

  return {
    conditionTypesByName,
    conditionEntries,
  };
}

async function main() {
  const previousOutputData = readJsonIfExists(OUTPUT_PATH) ?? {};
  const previousOutputSchedule = previousOutputData?.schedule ?? {};
  const previousEventTypes = previousOutputData?.eventTypes ?? {};
  const previousMaps = previousOutputData?.maps ?? {};
  const hadPreviousSchedule = Boolean(previousOutputData && previousOutputData.schedule);
  // Backward compatibility: pre-region output was a single global (Europe) schedule.
  const previousSchedule = previousOutputData?.regions
    ? previousOutputSchedule
    : Object.keys(previousOutputSchedule).length > 0
      ? { europe: previousOutputSchedule }
      : {};
  const eventTypesSourceData = readJsonIfExists(EVENT_TYPES_PATH) ?? {};
  const sourceEventTypes =
    eventTypesSourceData &&
    typeof eventTypesSourceData === 'object' &&
    eventTypesSourceData.eventTypes &&
    typeof eventTypesSourceData.eventTypes === 'object'
      ? eventTypesSourceData.eventTypes
      : eventTypesSourceData;

  const mapIdByDisplayName = new Map(
    Object.entries(previousMaps).map(([mapId, map]) => [
      normalizeMapDisplayName(map?.displayName).toLowerCase(),
      mapId,
    ])
  );

  const { conditionTypesByName, conditionEntries } = await collectMapConditionEntries();

  const schedule = {};
  const eventTypes = {};
  const discoveredMaps = {};
  const ignoredMapNames = new Set();
  const ignoredEntries = [];
  const dedupeKeys = new Set();
  let minTimestamp = Number.POSITIVE_INFINITY;
  let maxTimestamp = Number.NEGATIVE_INFINITY;
  let includedConditionCount = 0;

  conditionEntries.forEach((entry) => {
    const conditionName = String(entry.conditionName ?? '').trim();
    const mapDisplayName = normalizeMapDisplayName(entry.mapDisplayName);
    const startTimestampMs = Number(entry.startTimestampMs);
    const endTimestampMs = Number(entry.endTimestampMs);
    const durationInSeconds = Number(entry.durationInSeconds);
    const category = String(entry.category ?? '').toLowerCase();

    if (!conditionName || !mapDisplayName) {
      ignoredEntries.push(`missing condition/map value from ${entry.sourcePage}`);
      return;
    }

    if (!['major', 'minor'].includes(category)) {
      ignoredEntries.push(`unknown category "${category}" for ${conditionName}`);
      return;
    }

    const mapId = resolveMapId(mapDisplayName, mapIdByDisplayName);
    if (!mapId) {
      ignoredMapNames.add(mapDisplayName);
      return;
    }

    const eventId = slugify(conditionName);
    if (!eventId) {
      ignoredEntries.push(`invalid event id for condition "${conditionName}"`);
      return;
    }

    const fallbackDuration = Number.isFinite(durationInSeconds) && durationInSeconds > 0
      ? durationInSeconds
      : 3600;

    const regionTimes = {
      europe: [startTimestampMs, endTimestampMs],
    };
    Object.entries(entry.regionTimestamps ?? {}).forEach(([upstreamKey, regionRange]) => {
      const regionId = REGION_ID_BY_UPSTREAM_KEY[upstreamKey];
      if (regionId && Array.isArray(regionRange)) {
        regionTimes[regionId] = regionRange;
      }
    });

    let insertedForEntry = false;

    REGION_ORDER.forEach((regionId) => {
      const regionRange = regionTimes[regionId];
      if (!Array.isArray(regionRange)) {
        return;
      }

      const regionStartMs = Number(regionRange[0]);
      if (!Number.isFinite(regionStartMs)) {
        return;
      }

      const regionEndMs = Number(regionRange[1]);
      const regionStartTimestamp = Math.floor(regionStartMs / 1000);
      const regionEndTimestamp = Number.isFinite(regionEndMs)
        ? Math.floor(regionEndMs / 1000)
        : regionStartTimestamp + fallbackDuration;

      const dedupeKey = `${regionId}|${mapId}|${category}|${regionStartTimestamp}|${eventId}`;
      if (dedupeKeys.has(dedupeKey)) {
        return;
      }
      dedupeKeys.add(dedupeKey);

      ensureRegionScheduleMap(schedule, regionId, mapId);
      schedule[regionId][mapId][category][String(regionStartTimestamp)] = eventId;
      insertedForEntry = true;

      minTimestamp = Math.min(minTimestamp, regionStartTimestamp);
      maxTimestamp = Math.max(maxTimestamp, regionEndTimestamp);
      includedConditionCount += 1;
    });

    if (!insertedForEntry) {
      return;
    }

    if (!discoveredMaps[mapId]) {
      discoveredMaps[mapId] = previousMaps[mapId] ?? { displayName: mapDisplayName };
    }

    if (!eventTypes[eventId]) {
      const previousEventType = previousEventTypes[eventId];
      const sourceEventType = sourceEventTypes[eventId];

      if (previousEventType && typeof previousEventType === 'object') {
        eventTypes[eventId] = previousEventType;
      } else {
        const sourceLocalizations =
          sourceEventType &&
          typeof sourceEventType === 'object' &&
          sourceEventType.localizations &&
          typeof sourceEventType.localizations === 'object'
            ? sourceEventType.localizations
            : null;

        const displayName =
          sourceEventType?.displayName && String(sourceEventType.displayName).trim()
            ? sourceEventType.displayName
            : conditionName;
        const localizations = sourceLocalizations ?? { en: displayName };

        eventTypes[eventId] = {
          displayName,
          icon: `https://cdn.arctracker.io/map-events/${eventId.replace(/-/g, '_')}.png`,
          translationKey: toCamelCaseFromKebab(eventId),
          category,
          localizations,
        };
      }
    }
  });

  const nowUnix = Math.floor(Date.now() / 1000);
  const mergeWindowStart = nowUnix - MERGE_HISTORY_WINDOW_SECONDS;
  let mergedPastEventCount = 0;

  Object.entries(previousSchedule).forEach(([regionId, regionSchedule]) => {
    Object.entries(regionSchedule ?? {}).forEach(([mapId, mapSchedule]) => {
      ensureRegionScheduleMap(schedule, regionId, mapId);

      if (!discoveredMaps[mapId] && previousMaps[mapId]) {
        discoveredMaps[mapId] = {
          displayName: previousMaps[mapId].displayName ?? mapId,
        };
      }

      ['major', 'minor'].forEach((category) => {
        const previousCategorySchedule = mapSchedule?.[category] ?? {};

        Object.entries(previousCategorySchedule).forEach(([timestampKey, eventId]) => {
          const timestamp = Number(timestampKey);
          if (!Number.isFinite(timestamp)) {
            return;
          }

          const isWithinMergeWindow = timestamp >= mergeWindowStart && timestamp < nowUnix;
          if (!isWithinMergeWindow) {
            return;
          }

          const currentEventId = schedule[regionId][mapId][category][timestampKey];
          if (currentEventId) {
            return;
          }

          schedule[regionId][mapId][category][timestampKey] = eventId;
          mergedPastEventCount += 1;

          if (!eventTypes[eventId]) {
            const previousEventType = previousEventTypes[eventId];
            if (previousEventType && typeof previousEventType === 'object') {
              eventTypes[eventId] = previousEventType;
            } else {
              const fallbackDisplayName = toDisplayNameFromEventId(eventId);
              eventTypes[eventId] = {
                displayName: fallbackDisplayName,
                icon: `https://cdn.arctracker.io/map-events/${String(eventId).replace(/-/g, '_')}.png`,
                translationKey: toCamelCaseFromKebab(String(eventId)),
                category,
                localizations: { en: fallbackDisplayName },
              };
            }
          }
        });
      });
    });
  });

  const sortedMapIds = sortMapIds(Object.keys(discoveredMaps));
  const sortedMaps = {};
  sortedMapIds.forEach((mapId) => {
    sortedMaps[mapId] = discoveredMaps[mapId] ?? { displayName: mapId };
  });

  const sortedSchedule = {};
  REGION_ORDER.forEach((regionId) => {
    const regionSchedule = schedule[regionId];
    if (!regionSchedule) {
      return;
    }

    const sortedRegionSchedule = {};
    sortedMapIds.forEach((mapId) => {
      const mapSchedule = regionSchedule[mapId];
      if (!mapSchedule) {
        return;
      }

      sortedRegionSchedule[mapId] = {
        major: sortNumericKeyedRecord(mapSchedule.major),
        minor: sortNumericKeyedRecord(mapSchedule.minor),
      };
    });

    sortedSchedule[regionId] = sortedRegionSchedule;
  });

  const sortedEventTypes = Object.fromEntries(
    Object.entries(eventTypes).sort((a, b) => {
      if (a[1].category !== b[1].category) {
        return a[1].category === 'major' ? -1 : 1;
      }
      return a[1].displayName.localeCompare(b[1].displayName);
    })
  );

  const fallbackEndTimestamp = Number.isFinite(maxTimestamp) ? maxTimestamp : null;
  const finalTimestampRange = collectTimestampRange(sortedSchedule, fallbackEndTimestamp);
  const futureChanges = hadPreviousSchedule
    ? summarizeFutureScheduleChanges(previousSchedule, sortedSchedule, nowUnix)
    : null;

  const regions = {};
  REGION_ORDER.forEach((regionId) => {
    const region = REGION_BY_ID[regionId];
    if (region) {
      regions[regionId] = {
        displayName: region.displayName,
        shortCode: region.shortCode,
        color: region.color,
      };
    }
  });

  const output = {
    _readme: {
      description: 'Map events schedule for ARC Raiders generated from arcraiders.com map-conditions',
      format:
        'Schedule is keyed by region id, then map id, then major/minor. Schedule keys are UNIX timestamps (seconds, UTC) at event start; values are event type ids.',
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      sourceFiles: {
        mapConditionsOverview: MAP_CONDITIONS_URL,
        eventTypes: 'public/data/schedule/event-types.json',
        previousSchedule: 'public/data/schedule/map-events.json',
      },
      timestampRange: finalTimestampRange,
      mergedPastEvents: {
        windowSeconds: MERGE_HISTORY_WINDOW_SECONDS,
        now: nowUnix,
        count: mergedPastEventCount,
      },
      ignoredMapNames: [...ignoredMapNames].sort((a, b) => a.localeCompare(b)),
      ignoredEntriesCount: ignoredEntries.length,
    },
    eventTypes: sortedEventTypes,
    maps: sortedMaps,
    regions,
    schedule: sortedSchedule,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`✓ Generated ${OUTPUT_PATH}`);
  console.log(`  Conditions found: ${conditionTypesByName.size}`);
  console.log(`  Entries scraped: ${conditionEntries.length}`);
  console.log(`  Conditions included: ${includedConditionCount}`);
  console.log(`  Maps included: ${sortedMapIds.length}`);
  console.log(`  Event types included: ${Object.keys(sortedEventTypes).length}`);
  console.log(`  Past events merged from previous schedule: ${mergedPastEventCount}`);
  printFutureScheduleChangeReport(futureChanges);
  console.log(
    `  Ignored map names: ${
      output.metadata.ignoredMapNames.length > 0
        ? output.metadata.ignoredMapNames.join(', ')
        : 'none'
    }`
  );
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
