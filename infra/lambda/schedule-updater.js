"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3 = new client_s3_1.S3Client({});
const MAP_CONDITIONS_URL = process.env.MAP_CONDITIONS_URL ?? "https://arcraiders.com/map-conditions";
const EVENT_TYPES_URL = process.env.EVENT_TYPES_URL ?? "https://raider-tools.app/data/schedule/event-types.json";
const SCHEDULE_BUCKET_NAME = process.env.SCHEDULE_BUCKET_NAME ?? "";
const SCHEDULE_KEY = process.env.SCHEDULE_KEY ?? "map-events.json";
const SCHEDULE_STAGING_KEY = process.env.SCHEDULE_STAGING_KEY ?? "staging/map-events.json";
const SCHEDULE_HEALTH_KEY = process.env.SCHEDULE_HEALTH_KEY ?? "health.json";
const MERGE_HISTORY_WINDOW_SECONDS = Number(process.env.MERGE_HISTORY_WINDOW_SECONDS ?? 30 * 24 * 60 * 60);
const FETCH_TIMEOUT_MS = 20_000;
const MAP_ORDER = [
    "dam-battleground",
    "buried-city",
    "the-spaceport",
    "blue-gate",
    "stella-montis",
];
const KNOWN_MAP_ID_BY_DISPLAY_NAME = {
    "Buried City": "buried-city",
    "Dam Battlegrounds": "dam-battleground",
    "Spaceport": "the-spaceport",
    "Stella Montis": "stella-montis",
    "The Blue Gate": "blue-gate",
};
async function handler() {
    if (!SCHEDULE_BUCKET_NAME) {
        throw new Error("Missing SCHEDULE_BUCKET_NAME");
    }
    const previousData = (await getJsonFromS3(SCHEDULE_KEY)) ?? {};
    const previousSchedule = previousData.schedule ?? {};
    const previousMaps = previousData.maps ?? {};
    const eventTypesSourceData = await fetchJson(EVENT_TYPES_URL);
    const sourceEventTypes = normalizeEventTypesPayload(eventTypesSourceData);
    if (!sourceEventTypes || Object.keys(sourceEventTypes).length === 0) {
        throw new Error("event-types source is empty");
    }
    const mapIdByDisplayName = new Map(Object.entries(previousMaps).map(([mapId, mapInfo]) => [
        normalizeMapDisplayName(mapInfo?.displayName).toLowerCase(),
        mapId,
    ]));
    const { conditionTypesByName, conditionEntries } = await collectMapConditionEntries();
    if (conditionTypesByName.size === 0) {
        throw new Error("No condition items found from map-conditions overview");
    }
    const schedule = {};
    const discoveredMaps = {};
    const fallbackEventTypes = {};
    const unknownEventTypeIds = new Set();
    const ignoredMapNames = new Set();
    const ignoredEntries = [];
    const dedupeKeys = new Set();
    let maxTimestamp = Number.NEGATIVE_INFINITY;
    let includedConditionCount = 0;
    conditionEntries.forEach((entry) => {
        const conditionName = String(entry.conditionName ?? "").trim();
        const mapDisplayName = normalizeMapDisplayName(entry.mapDisplayName);
        const startTimestampMs = Number(entry.startTimestampMs);
        const endTimestampMs = Number(entry.endTimestampMs);
        const durationInSeconds = Number(entry.durationInSeconds);
        const category = String(entry.category ?? "").toLowerCase();
        if (!conditionName || !mapDisplayName) {
            ignoredEntries.push(`missing condition/map value from ${entry.sourcePage}`);
            return;
        }
        if (!Number.isFinite(startTimestampMs)) {
            ignoredEntries.push(`invalid start timestamp for ${conditionName} (${mapDisplayName})`);
            return;
        }
        if (!["major", "minor"].includes(category)) {
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
        if (!sourceEventTypes[eventId]) {
            unknownEventTypeIds.add(eventId);
            fallbackEventTypes[eventId] = {
                displayName: conditionName,
                icon: `https://cdn.arctracker.io/map-events/${eventId.replace(/-/g, "_")}.png`,
                translationKey: toCamelCaseFromKebab(eventId),
                category,
                localizations: { en: conditionName },
            };
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
        const safeDuration = Number.isFinite(durationInSeconds) && durationInSeconds > 0 ? durationInSeconds : 3600;
        const endTimestamp = Number.isFinite(endTimestampMs)
            ? Math.floor(endTimestampMs / 1000)
            : startTimestamp + safeDuration;
        maxTimestamp = Math.max(maxTimestamp, endTimestamp);
        includedConditionCount += 1;
    });
    if (includedConditionCount === 0) {
        throw new Error("No valid schedule entries parsed from map-conditions");
    }
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
        ["major", "minor"].forEach((category) => {
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
            });
        });
    });
    const sortedMapIds = sortMapIds(Object.keys(schedule));
    if (sortedMapIds.length === 0) {
        throw new Error("Schedule output contains no maps");
    }
    const sortedMaps = {};
    const sortedSchedule = {};
    sortedMapIds.forEach((mapId) => {
        sortedMaps[mapId] = discoveredMaps[mapId] ?? { displayName: mapId };
        sortedSchedule[mapId] = {
            major: sortNumericKeyedRecord(schedule[mapId].major),
            minor: sortNumericKeyedRecord(schedule[mapId].minor),
        };
    });
    const timestampRange = collectTimestampRange(sortedSchedule, Number.isFinite(maxTimestamp) ? maxTimestamp : null);
    const mapEventsOutput = {
        _readme: {
            description: "Map events schedule for ARC Raiders generated by scheduled updater",
            format: "Schedule keys are UNIX timestamps (seconds, UTC) at event start; values are event type ids.",
        },
        metadata: {
            generatedAt: new Date().toISOString(),
            sourceFiles: {
                mapConditionsOverview: MAP_CONDITIONS_URL,
                mapConditionsPerCondition: `${MAP_CONDITIONS_URL}/<condition-slug>`,
                eventTypes: EVENT_TYPES_URL,
                previousScheduleS3Key: SCHEDULE_KEY,
            },
            timestampRange,
            mergedPastEvents: {
                windowSeconds: MERGE_HISTORY_WINDOW_SECONDS,
                now: nowUnix,
                count: mergedPastEventCount,
            },
            ignoredMapNames: [...ignoredMapNames].sort((a, b) => a.localeCompare(b)),
            ignoredEntriesCount: ignoredEntries.length,
            unknownEventTypeIds: [...unknownEventTypeIds].sort((a, b) => a.localeCompare(b)),
        },
        eventTypes: fallbackEventTypes,
        maps: sortedMaps,
        schedule: sortedSchedule,
    };
    const healthOutput = {
        status: "ok",
        generatedAt: new Date().toISOString(),
        scheduleKey: SCHEDULE_KEY,
        conditionPagesScraped: conditionTypesByName.size,
        conditionsIncluded: includedConditionCount,
        mapsIncluded: sortedMapIds.length,
        unknownEventTypeCount: unknownEventTypeIds.size,
    };
    await putJsonToS3(SCHEDULE_STAGING_KEY, mapEventsOutput, "private, max-age=0, no-cache");
    await putJsonToS3(SCHEDULE_KEY, mapEventsOutput, "public, max-age=300, stale-while-revalidate=300");
    await putJsonToS3(SCHEDULE_HEALTH_KEY, healthOutput, "public, max-age=60, stale-while-revalidate=60");
    console.log("schedule-updater success", {
        bucket: SCHEDULE_BUCKET_NAME,
        key: SCHEDULE_KEY,
        stagingKey: SCHEDULE_STAGING_KEY,
        healthKey: SCHEDULE_HEALTH_KEY,
        mapsIncluded: sortedMapIds.length,
        conditionsIncluded: includedConditionCount,
        mergedPastEventCount,
        unknownEventTypeCount: unknownEventTypeIds.size,
    });
}
async function collectMapConditionEntries() {
    const overviewHtml = await fetchText(MAP_CONDITIONS_URL);
    const conditionItems = extractJsonArrayByPropertyName(overviewHtml, "conditionItems") ?? [];
    const conditionTypesByName = new Map();
    conditionItems.forEach((conditionItem) => {
        const name = String(conditionItem?.name ?? "").trim();
        const type = String(conditionItem?.type ?? "").trim().toLowerCase();
        if (!name || !["major", "minor"].includes(type)) {
            return;
        }
        conditionTypesByName.set(name, type);
    });
    const conditionEntries = [];
    for (const [conditionName, conditionCategory] of conditionTypesByName.entries()) {
        const conditionSlug = slugify(conditionName);
        if (!conditionSlug) {
            continue;
        }
        const pageUrl = `${MAP_CONDITIONS_URL}/${conditionSlug}`;
        const html = await fetchText(pageUrl);
        const entries = extractJsonArrayByPropertyName(html, "entries") ?? [];
        entries.forEach((entry) => {
            conditionEntries.push({
                conditionName: String(entry?.conditionName ?? "").trim(),
                mapDisplayName: String(entry?.mapDisplayName ?? "").trim(),
                startTimestampMs: Number(entry?.startTimestamp),
                endTimestampMs: Number(entry?.endTimestamp),
                durationInSeconds: Number(entry?.durationInSeconds),
                category: conditionCategory,
                sourcePage: pageUrl,
            });
        });
    }
    return {
        conditionTypesByName,
        conditionEntries,
    };
}
async function fetchText(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            headers: {
                accept: "text/html,application/xhtml+xml",
                "user-agent": "raider-tools-schedule-updater/1.0",
            },
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
        }
        return await response.text();
    }
    finally {
        clearTimeout(timeout);
    }
}
async function fetchJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            headers: {
                accept: "application/json,text/plain,*/*",
                "user-agent": "raider-tools-schedule-updater/1.0",
            },
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
        }
        return response.json();
    }
    finally {
        clearTimeout(timeout);
    }
}
function normalizeEventTypesPayload(source) {
    if (!source || typeof source !== "object") {
        throw new Error("event-types payload is not an object");
    }
    const maybeWrapper = source;
    const payload = maybeWrapper.eventTypes && typeof maybeWrapper.eventTypes === "object"
        ? maybeWrapper.eventTypes
        : source;
    if (!payload || typeof payload !== "object") {
        throw new Error("event-types payload is invalid");
    }
    return payload;
}
function extractJsonArrayByPropertyName(document, propertyName) {
    const markerIndex = document.indexOf(propertyName);
    if (markerIndex === -1) {
        return null;
    }
    const colonIndex = document.indexOf(":", markerIndex + propertyName.length);
    if (colonIndex === -1) {
        return null;
    }
    const startIndex = document.indexOf("[", colonIndex + 1);
    if (startIndex === -1) {
        return null;
    }
    let depth = 0;
    for (let index = startIndex; index < document.length; index += 1) {
        const char = document[index];
        if (char === "[") {
            depth += 1;
            continue;
        }
        if (char === "]") {
            depth -= 1;
            if (depth === 0) {
                const rawEscaped = document.slice(startIndex, index + 1);
                const jsonText = rawEscaped.replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
                try {
                    return JSON.parse(jsonText);
                }
                catch {
                    return null;
                }
            }
        }
    }
    return null;
}
async function getJsonFromS3(key) {
    try {
        const response = await s3.send(new client_s3_1.GetObjectCommand({
            Bucket: SCHEDULE_BUCKET_NAME,
            Key: key,
        }));
        const body = await bodyToString(response.Body);
        if (!body.trim()) {
            return null;
        }
        return JSON.parse(body);
    }
    catch (error) {
        const serviceError = error;
        if (serviceError?.name === "NoSuchKey" || serviceError?.$metadata?.httpStatusCode === 404) {
            return null;
        }
        throw error;
    }
}
async function putJsonToS3(key, payload, cacheControl) {
    await s3.send(new client_s3_1.PutObjectCommand({
        Bucket: SCHEDULE_BUCKET_NAME,
        Key: key,
        Body: `${JSON.stringify(payload, null, 2)}\n`,
        ContentType: "application/json; charset=utf-8",
        CacheControl: cacheControl,
    }));
}
async function bodyToString(body) {
    if (!body) {
        return "";
    }
    if (typeof body.transformToString === "function") {
        return body.transformToString();
    }
    const chunks = [];
    for await (const chunk of body) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
}
function normalizeMapDisplayName(value) {
    return String(value ?? "").trim();
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
function slugify(value) {
    return String(value ?? "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
function toCamelCaseFromKebab(value) {
    return value.replace(/-([a-z])/g, (_match, char) => char.toUpperCase());
}
function canonicalizeMapId(rawMapId) {
    const withHyphens = String(rawMapId ?? "")
        .trim()
        .toLowerCase()
        .replace(/_/g, "-");
    if (withHyphens === "dam-battlegrounds") {
        return "dam-battleground";
    }
    if (withHyphens === "the-blue-gate") {
        return "blue-gate";
    }
    if (withHyphens === "spaceport") {
        return "the-spaceport";
    }
    return withHyphens;
}
function ensureScheduleMap(schedule, mapId) {
    if (!schedule[mapId]) {
        schedule[mapId] = { major: {}, minor: {} };
    }
    return schedule[mapId];
}
function sortNumericKeyedRecord(record) {
    return Object.fromEntries(Object.entries(record).sort((a, b) => Number(a[0]) - Number(b[0])));
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
function collectTimestampRange(schedule, fallbackEndTimestamp) {
    let minTimestamp = Number.POSITIVE_INFINITY;
    let maxTimestamp = Number.NEGATIVE_INFINITY;
    Object.values(schedule).forEach((mapSchedule) => {
        ["major", "minor"].forEach((category) => {
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
            end: Number.isFinite(fallbackEndTimestamp ?? Number.NaN) ? fallbackEndTimestamp : null,
        };
    }
    const end = Number.isFinite(fallbackEndTimestamp ?? Number.NaN)
        ? Math.max(fallbackEndTimestamp, maxTimestamp)
        : maxTimestamp;
    return {
        start: minTimestamp,
        end,
    };
}
