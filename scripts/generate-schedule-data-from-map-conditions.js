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

function ensureScheduleMap(schedule, mapId) {
  if (!schedule[mapId]) {
    schedule[mapId] = { major: {}, minor: {} };
  }

  return schedule[mapId];
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

  Object.values(schedule).forEach((mapSchedule) => {
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

  Object.entries(schedule ?? {}).forEach(([mapId, mapSchedule]) => {
    ['major', 'minor'].forEach((category) => {
      Object.entries(mapSchedule?.[category] ?? {}).forEach(([timestampKey, eventId]) => {
        const timestamp = Number(timestampKey);
        if (!Number.isFinite(timestamp) || timestamp < minTimestampInclusive) {
          return;
        }

        entries.push({
          mapId,
          category,
          timestamp,
          eventId: String(eventId),
          key: `${mapId}|${category}|${timestamp}`,
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
    const groupKey = `${entry.mapId}|${entry.category}|${entry.eventId}`;
    const group = additionsByGroup.get(groupKey) ?? [];
    group.push(entry);
    additionsByGroup.set(groupKey, group);
  });

  rawRemoved.forEach((entry) => {
    const groupKey = `${entry.mapId}|${entry.category}|${entry.eventId}`;
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
      `${entry.mapId}/${entry.category} ${formatUtcTimestamp(entry.timestamp)} -> ${entry.eventId}`,
    'Added future events'
  );

  printPreviewLines(
    changes.removed,
    (entry) =>
      `${entry.mapId}/${entry.category} ${formatUtcTimestamp(entry.timestamp)} -> ${entry.eventId}`,
    'Removed future events'
  );

  printPreviewLines(
    changes.moved,
    (entry) =>
      `${entry.mapId}/${entry.category} ${entry.eventId}: ${formatUtcTimestamp(entry.fromTimestamp)} -> ${formatUtcTimestamp(entry.toTimestamp)}`,
    'Moved future events'
  );

  printPreviewLines(
    changes.replaced,
    (entry) =>
      `${entry.mapId}/${entry.category} ${formatUtcTimestamp(entry.timestamp)}: ${entry.fromEventId} -> ${entry.toEventId}`,
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

  const conditionEntries = [];
  const conditionTypesByName = new Map();

  conditionItems.forEach((conditionItem) => {
    const name = String(conditionItem?.name ?? '').trim();
    const type = String(conditionItem?.type ?? '').trim().toLowerCase();
    if (!name || !['major', 'minor'].includes(type)) {
      return;
    }

    conditionTypesByName.set(name, type);
  });

  for (const [conditionName, conditionCategory] of conditionTypesByName.entries()) {
    const conditionSlug = slugify(conditionName);
    if (!conditionSlug) {
      continue;
    }

    const pageUrl = `${MAP_CONDITIONS_URL}/${conditionSlug}`;
    const html = await fetchText(pageUrl);
    const entries = extractEscapedJsonArray(html, '\\\"entries\\\":') ?? [];

    entries.forEach((entry) => {
      const entryConditionName = String(entry?.conditionName ?? '').trim();
      const resolvedCategory =
        conditionTypesByName.get(entryConditionName) ?? conditionCategory;
      conditionEntries.push({
        conditionName: entryConditionName,
        mapDisplayName: String(entry?.mapDisplayName ?? '').trim(),
        startTimestampMs: Number(entry?.startTimestamp),
        endTimestampMs: Number(entry?.endTimestamp),
        durationInSeconds: Number(entry?.durationInSeconds),
        category: resolvedCategory,
        sourcePage: pageUrl,
      });
    });
  }

  return {
    conditionTypesByName,
    conditionEntries,
  };
}

async function main() {
  const previousOutputData = readJsonIfExists(OUTPUT_PATH) ?? {};
  const previousSchedule = previousOutputData?.schedule ?? {};
  const previousEventTypes = previousOutputData?.eventTypes ?? {};
  const previousMaps = previousOutputData?.maps ?? {};
  const hadPreviousSchedule = Boolean(previousOutputData && previousOutputData.schedule);
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

    if (!Number.isFinite(startTimestampMs)) {
      ignoredEntries.push(`invalid start timestamp for ${conditionName} (${mapDisplayName})`);
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

    const startTimestamp = Math.floor(startTimestampMs / 1000);
    const dedupeKey = `${mapId}|${category}|${startTimestamp}|${eventId}`;
    if (dedupeKeys.has(dedupeKey)) {
      return;
    }
    dedupeKeys.add(dedupeKey);

    ensureScheduleMap(schedule, mapId);
    schedule[mapId][category][String(startTimestamp)] = eventId;

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

    const fallbackDuration = Number.isFinite(durationInSeconds) && durationInSeconds > 0
      ? durationInSeconds
      : 3600;
    const calculatedEndTimestamp = Number.isFinite(endTimestampMs)
      ? Math.floor(endTimestampMs / 1000)
      : startTimestamp + fallbackDuration;

    minTimestamp = Math.min(minTimestamp, startTimestamp);
    maxTimestamp = Math.max(maxTimestamp, calculatedEndTimestamp);
    includedConditionCount += 1;
  });

  const nowUnix = Math.floor(Date.now() / 1000);
  const mergeWindowStart = nowUnix - MERGE_HISTORY_WINDOW_SECONDS;
  let mergedPastEventCount = 0;

  Object.entries(previousSchedule).forEach(([mapId, mapSchedule]) => {
    ensureScheduleMap(schedule, mapId);

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

        const currentEventId = schedule[mapId][category][timestampKey];
        if (currentEventId) {
          return;
        }

        schedule[mapId][category][timestampKey] = eventId;
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

  const fallbackEndTimestamp = Number.isFinite(maxTimestamp) ? maxTimestamp : null;
  const finalTimestampRange = collectTimestampRange(sortedSchedule, fallbackEndTimestamp);
  const futureChanges = hadPreviousSchedule
    ? summarizeFutureScheduleChanges(previousSchedule, sortedSchedule, nowUnix)
    : null;

  const output = {
    _readme: {
      description: 'Map events schedule for ARC Raiders generated from arcraiders.com map-conditions',
      format:
        'Schedule keys are UNIX timestamps (seconds, UTC) at event start; values are event type ids.',
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      sourceFiles: {
        mapConditionsOverview: MAP_CONDITIONS_URL,
        mapConditionsPerCondition: `${MAP_CONDITIONS_URL}/<condition-slug>`,
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
    schedule: sortedSchedule,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`✓ Generated ${OUTPUT_PATH}`);
  console.log(`  Condition pages scraped: ${conditionTypesByName.size}`);
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
