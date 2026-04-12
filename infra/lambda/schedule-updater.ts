
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({});

const MAP_CONDITIONS_URL = process.env.MAP_CONDITIONS_URL ?? "https://arcraiders.com/map-conditions";
const EVENT_TYPES_URL =
    process.env.EVENT_TYPES_URL ?? "https://raider-tools.app/data/schedule/event-types.json";
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

const KNOWN_MAP_ID_BY_DISPLAY_NAME: Record<string, string> = {
    "Buried City": "buried-city",
    "Dam Battlegrounds": "dam-battleground",
    "Spaceport": "the-spaceport",
    "Stella Montis": "stella-montis",
    "The Blue Gate": "blue-gate",
};

type EventCategory = "major" | "minor";

interface EventTypeDefinition {
    displayName: string;
    icon: string;
    translationKey: string;
    category: EventCategory | "none";
    localizations?: Record<string, string>;
    disabled?: boolean;
}

interface EventSchedule {
    major: Record<string, string>;
    minor: Record<string, string>;
}

interface MapEventsData {
    _readme?: Record<string, string>;
    metadata?: Record<string, unknown>;
    eventTypes?: Record<string, EventTypeDefinition>;
    maps?: Record<string, { displayName: string }>;
    schedule?: Record<string, EventSchedule>;
}

interface ConditionEntry {
    conditionName: string;
    mapDisplayName: string;
    startTimestampMs: number;
    endTimestampMs: number;
    durationInSeconds: number;
    category: EventCategory;
    sourcePage: string;
}

export async function handler(): Promise<void> {
    if (!SCHEDULE_BUCKET_NAME) {
        throw new Error("Missing SCHEDULE_BUCKET_NAME");
    }

    const previousData = (await getJsonFromS3<MapEventsData>(SCHEDULE_KEY)) ?? {};
    const previousSchedule = previousData.schedule ?? {};
    const previousMaps = previousData.maps ?? {};

    const eventTypesSourceData = await fetchJson<unknown>(EVENT_TYPES_URL);
    const sourceEventTypes = normalizeEventTypesPayload(eventTypesSourceData);

    if (!sourceEventTypes || Object.keys(sourceEventTypes).length === 0) {
        throw new Error("event-types source is empty");
    }

    const mapIdByDisplayName = new Map(
        Object.entries(previousMaps).map(([mapId, mapInfo]) => [
            normalizeMapDisplayName(mapInfo?.displayName).toLowerCase(),
            mapId,
        ])
    );

    const { conditionTypesByName, conditionEntries } = await collectMapConditionEntries();
    if (conditionTypesByName.size === 0) {
        throw new Error("No condition items found from map-conditions overview");
    }

    const schedule: Record<string, EventSchedule> = {};
    const discoveredMaps: Record<string, { displayName: string }> = {};
    const fallbackEventTypes: Record<string, EventTypeDefinition> = {};
    const unknownEventTypeIds = new Set<string>();
    const ignoredMapNames = new Set<string>();
    const ignoredEntries: string[] = [];
    const dedupeKeys = new Set<string>();

    let maxTimestamp = Number.NEGATIVE_INFINITY;
    let includedConditionCount = 0;

    conditionEntries.forEach((entry) => {
        const conditionName = String(entry.conditionName ?? "").trim();
        const mapDisplayName = normalizeMapDisplayName(entry.mapDisplayName);
        const startTimestampMs = Number(entry.startTimestampMs);
        const endTimestampMs = Number(entry.endTimestampMs);
        const durationInSeconds = Number(entry.durationInSeconds);
        const category = String(entry.category ?? "").toLowerCase() as EventCategory;

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

        const safeDuration =
            Number.isFinite(durationInSeconds) && durationInSeconds > 0 ? durationInSeconds : 3600;
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

        (["major", "minor"] as EventCategory[]).forEach((category) => {
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

    const sortedMaps: Record<string, { displayName: string }> = {};
    const sortedSchedule: Record<string, EventSchedule> = {};

    sortedMapIds.forEach((mapId) => {
        sortedMaps[mapId] = discoveredMaps[mapId] ?? { displayName: mapId };
        sortedSchedule[mapId] = {
            major: sortNumericKeyedRecord(schedule[mapId].major),
            minor: sortNumericKeyedRecord(schedule[mapId].minor),
        };
    });

    const timestampRange = collectTimestampRange(
        sortedSchedule,
        Number.isFinite(maxTimestamp) ? maxTimestamp : null
    );

    const mapEventsOutput: MapEventsData = {
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
    await putJsonToS3(
        SCHEDULE_KEY,
        mapEventsOutput,
        "public, max-age=300, stale-while-revalidate=300"
    );
    await putJsonToS3(
        SCHEDULE_HEALTH_KEY,
        healthOutput,
        "public, max-age=60, stale-while-revalidate=60"
    );

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

async function collectMapConditionEntries(): Promise<{
    conditionTypesByName: Map<string, EventCategory>;
    conditionEntries: ConditionEntry[];
}> {
    const overviewHtml = await fetchText(MAP_CONDITIONS_URL);
    const conditionItems =
        (extractJsonArrayByPropertyName(overviewHtml, "conditionItems") as Array<{
            name?: string;
            type?: string;
        }>) ?? [];

    const conditionTypesByName = new Map<string, EventCategory>();
    conditionItems.forEach((conditionItem) => {
        const name = String(conditionItem?.name ?? "").trim();
        const type = String(conditionItem?.type ?? "").trim().toLowerCase();

        if (!name || !["major", "minor"].includes(type)) {
            return;
        }

        conditionTypesByName.set(name, type as EventCategory);
    });

    const conditionEntries: ConditionEntry[] = [];
    for (const [conditionName, conditionCategory] of conditionTypesByName.entries()) {
        const conditionSlug = slugify(conditionName);
        if (!conditionSlug) {
            continue;
        }

        const pageUrl = `${MAP_CONDITIONS_URL}/${conditionSlug}`;
        const html = await fetchText(pageUrl);
        const entries =
            (extractJsonArrayByPropertyName(html, "entries") as Array<{
                conditionName?: string;
                mapDisplayName?: string;
                startTimestamp?: number;
                endTimestamp?: number;
                durationInSeconds?: number;
            }>) ?? [];

        entries.forEach((entry) => {
            const entryConditionName = String(entry?.conditionName ?? "").trim();
            const resolvedCategory =
                conditionTypesByName.get(entryConditionName) ?? conditionCategory;
            conditionEntries.push({
                conditionName: entryConditionName,
                mapDisplayName: String(entry?.mapDisplayName ?? "").trim(),
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

async function fetchText(url: string): Promise<string> {
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
    } finally {
        clearTimeout(timeout);
    }
}

async function fetchJson<T>(url: string): Promise<T> {
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

        return response.json() as Promise<T>;
    } finally {
        clearTimeout(timeout);
    }
}

function normalizeEventTypesPayload(source: unknown): Record<string, EventTypeDefinition> {
    if (!source || typeof source !== "object") {
        throw new Error("event-types payload is not an object");
    }

    const maybeWrapper = source as { eventTypes?: unknown };
    const payload = maybeWrapper.eventTypes && typeof maybeWrapper.eventTypes === "object"
        ? maybeWrapper.eventTypes
        : source;

    if (!payload || typeof payload !== "object") {
        throw new Error("event-types payload is invalid");
    }

    return payload as Record<string, EventTypeDefinition>;
}
function extractJsonArrayByPropertyName(document: string, propertyName: string): unknown[] | null {
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
                    return JSON.parse(jsonText) as unknown[];
                } catch {
                    return null;
                }
            }
        }
    }

    return null;
}

async function getJsonFromS3<T>(key: string): Promise<T | null> {
    try {
        const response = await s3.send(
            new GetObjectCommand({
                Bucket: SCHEDULE_BUCKET_NAME,
                Key: key,
            })
        );
        const body = await bodyToString(response.Body);
        if (!body.trim()) {
            return null;
        }
        return JSON.parse(body) as T;
    } catch (error: unknown) {
        const serviceError = error as { name?: string; $metadata?: { httpStatusCode?: number } };
        if (serviceError?.name === "NoSuchKey" || serviceError?.$metadata?.httpStatusCode === 404) {
            return null;
        }
        throw error;
    }
}

async function putJsonToS3(key: string, payload: unknown, cacheControl: string): Promise<void> {
    await s3.send(
        new PutObjectCommand({
            Bucket: SCHEDULE_BUCKET_NAME,
            Key: key,
            Body: `${JSON.stringify(payload, null, 2)}\n`,
            ContentType: "application/json; charset=utf-8",
            CacheControl: cacheControl,
        })
    );
}

async function bodyToString(
    body: { transformToString?: () => Promise<string> } | AsyncIterable<Uint8Array> | undefined
): Promise<string> {
    if (!body) {
        return "";
    }

    if (typeof (body as { transformToString?: () => Promise<string> }).transformToString === "function") {
        return (body as { transformToString: () => Promise<string> }).transformToString();
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
}

function normalizeMapDisplayName(value: unknown): string {
    return String(value ?? "").trim();
}

function resolveMapId(mapDisplayName: string, mapIdByDisplayName: Map<string, string>): string | null {
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

function slugify(value: unknown): string {
    return String(value ?? "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function toCamelCaseFromKebab(value: string): string {
    return value.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
}

function canonicalizeMapId(rawMapId: string): string {
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

function ensureScheduleMap(schedule: Record<string, EventSchedule>, mapId: string): EventSchedule {
    if (!schedule[mapId]) {
        schedule[mapId] = { major: {}, minor: {} };
    }

    return schedule[mapId];
}

function sortNumericKeyedRecord(record: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(record).sort((a, b) => Number(a[0]) - Number(b[0])));
}

function sortMapIds(mapIds: string[]): string[] {
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

function collectTimestampRange(
    schedule: Record<string, EventSchedule>,
    fallbackEndTimestamp: number | null
): { start: number | null; end: number | null } {
    let minTimestamp = Number.POSITIVE_INFINITY;
    let maxTimestamp = Number.NEGATIVE_INFINITY;

    Object.values(schedule).forEach((mapSchedule) => {
        (["major", "minor"] as EventCategory[]).forEach((category) => {
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
        ? Math.max(fallbackEndTimestamp as number, maxTimestamp)
        : maxTimestamp;

    return {
        start: minTimestamp,
        end,
    };
}
