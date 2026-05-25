import type {
    APIGatewayProxyEventV2WithJWTAuthorizer,
    APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    fetchEmbarkQuests,
    getEmbarkRequestConfig,
    type EmbarkTokenPayload,
} from "./_lib/embark";
import { decryptToken, type EnvelopePayload } from "./_lib/envelope";
import {
    hasJwtGroup,
    jsonResponse,
    jwtSub,
    pickAllowedOrigin,
} from "./_lib/http";
import {
    createSnapshotId,
    readNormalizedSnapshot,
    storeEmbarkQuestSnapshots,
} from "./_lib/embarkSnapshotStorage";
import { consumeTokenBucket } from "./_lib/embarkThrottle";
import {
    decodeEmbarkQuests,
    type DecodedEmbarkQuestSnapshot,
    type EmbarkRawQuestsResponse,
} from "./_lib/embarkQuestDecode";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: {
        removeUndefinedValues: true,
    },
});

const EMBARK_AUTH_GROUP = "embark-auth";
const USER_THROTTLE = {
    capacity: Number(process.env.EMBARK_QUESTS_USER_BUCKET_CAPACITY ?? 6),
    refillIntervalSeconds: Number(process.env.EMBARK_QUESTS_USER_REFILL_SECONDS ?? 300),
    refillTokens: 1,
};
const GLOBAL_THROTTLE = {
    capacity: Number(process.env.EMBARK_QUESTS_GLOBAL_BUCKET_CAPACITY ?? 120),
    refillIntervalSeconds: Number(process.env.EMBARK_QUESTS_GLOBAL_REFILL_SECONDS ?? 60),
    refillTokens: Number(process.env.EMBARK_QUESTS_GLOBAL_REFILL_TOKENS ?? 20),
};

interface EmbarkLinkItem extends EnvelopePayload {
    expiresAt?: string | null;
}

interface LatestQuestsRow {
    pk: string;
    sk: string;
    source: "embark";
    syncedAt: string;
    cachedAt: number;
    schemaVersion: 1;
    rawSnapshotId: string;
    rawSnapshotKey?: string;
    normalizedSnapshotKey?: string;
    snapshot?: DecodedEmbarkQuestSnapshot;
    updatedAt: string;
}

export async function handler(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
    const origin = pickAllowedOrigin(event);
    const sub = jwtSub(event);
    if (!sub) return jsonResponse(401, { error: "Unauthenticated" }, origin);
    if (!hasJwtGroup(event, EMBARK_AUTH_GROUP)) {
        return jsonResponse(403, { error: "not_enabled" }, origin);
    }

    const tableName = process.env.USER_TABLE_NAME!;
    const method = event.requestContext.http.method;

    try {
        if (method === "GET") return await handleGet(tableName, sub, origin);
        if (method === "POST") return await handleSync(tableName, sub, origin);
        return jsonResponse(405, { error: "Method not allowed" }, origin);
    } catch (err) {
        const e = err as Error;
        console.error("EmbarkQuestsFn error", {
            message: e.message,
            name: e.name,
        });
        return jsonResponse(500, { error: "embark_unavailable" }, origin);
    }
}

async function handleGet(
    tableName: string,
    sub: string,
    origin: string,
): Promise<APIGatewayProxyResultV2> {
    const row = await getLatestRow(tableName, sub);
    if (!row) return jsonResponse(404, { error: "not_synced" }, origin);
    if (row.schemaVersion !== 1) {
        return jsonResponse(404, { error: "snapshot_schema_unsupported" }, origin);
    }
    const snapshot = await loadSnapshotFromRow(row);
    return jsonResponse(200, snapshot, origin);
}

async function handleSync(
    tableName: string,
    sub: string,
    origin: string,
): Promise<APIGatewayProxyResultV2> {
    const link = await loadEmbarkLink(tableName, sub);
    if (!link) return jsonResponse(401, { error: "not_linked" }, origin);
    if (isExpired(link.expiresAt ?? null)) {
        return jsonResponse(401, { error: "token_expired" }, origin);
    }

    const userThrottle = await consumeTokenBucket({
        ddb,
        tableName,
        pk: `USER#${sub}`,
        sk: "THROTTLE#embark#quests",
        config: USER_THROTTLE,
    });
    if (!userThrottle.allowed) {
        return jsonResponse(429, {
            error: "rate_limited_user",
            retryAfterSeconds: userThrottle.retryAfterSeconds,
            nextAllowedAt: userThrottle.nextAllowedAt,
            remainingTokens: userThrottle.remainingTokens,
        }, origin, { "Retry-After": String(userThrottle.retryAfterSeconds ?? 1) });
    }

    const globalThrottle = await consumeTokenBucket({
        ddb,
        tableName,
        pk: "GLOBAL#embark",
        sk: "THROTTLE#quests",
        config: GLOBAL_THROTTLE,
    });
    if (!globalThrottle.allowed) {
        return jsonResponse(429, {
            error: "rate_limited_global",
            retryAfterSeconds: globalThrottle.retryAfterSeconds,
            nextAllowedAt: globalThrottle.nextAllowedAt,
            remainingTokens: globalThrottle.remainingTokens,
        }, origin, { "Retry-After": String(globalThrottle.retryAfterSeconds ?? 1) });
    }

    const token = await decryptEmbarkToken(link, sub);
    if (!token.access_token) return jsonResponse(401, { error: "not_linked" }, origin);

    const config = await getEmbarkRequestConfig();
    const raw = await fetchEmbarkQuests(token.access_token, config) as EmbarkRawQuestsResponse | null;
    const normalizedRaw: EmbarkRawQuestsResponse = {
        quests: Array.isArray(raw?.quests) ? raw.quests : [],
    };

    const syncedAt = new Date().toISOString();
    const cachedAt = Date.now();
    const rawSnapshotId = createSnapshotId();
    const snapshot = decodeEmbarkQuests(normalizedRaw, {
        syncedAt,
        cachedAt,
        rawSnapshotId,
    });
    const refs = await storeEmbarkQuestSnapshots({
        userId: sub,
        rawQuests: normalizedRaw,
        normalizedSnapshot: snapshot,
        syncedAt,
        rawSnapshotId,
    });

    const item: LatestQuestsRow = {
        pk: `USER#${sub}`,
        sk: "EMBARK#QUESTS#LATEST",
        source: "embark",
        syncedAt,
        cachedAt,
        schemaVersion: 1,
        rawSnapshotId,
        rawSnapshotKey: refs.rawSnapshotKey,
        normalizedSnapshotKey: refs.normalizedSnapshotKey,
        snapshot: refs.normalizedSnapshotKey ? undefined : snapshot,
        updatedAt: syncedAt,
    };

    await ddb.send(new PutCommand({
        TableName: tableName,
        Item: item,
    }));

    return jsonResponse(200, snapshot, origin);
}

async function loadEmbarkLink(tableName: string, sub: string): Promise<EmbarkLinkItem | null> {
    const resp = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { pk: `USER#${sub}`, sk: "LINK#embark" },
    }));
    return (resp.Item as EmbarkLinkItem | undefined) ?? null;
}

async function getLatestRow(tableName: string, sub: string): Promise<LatestQuestsRow | null> {
    const resp = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { pk: `USER#${sub}`, sk: "EMBARK#QUESTS#LATEST" },
    }));
    return (resp.Item as LatestQuestsRow | undefined) ?? null;
}

async function loadSnapshotFromRow(row: LatestQuestsRow): Promise<DecodedEmbarkQuestSnapshot> {
    if (row.snapshot) return row.snapshot;
    if (row.normalizedSnapshotKey) {
        return readNormalizedSnapshot<DecodedEmbarkQuestSnapshot>(row.normalizedSnapshotKey);
    }
    throw new Error("Latest Embark quests row has no snapshot payload");
}

async function decryptEmbarkToken(link: EmbarkLinkItem, sub: string): Promise<EmbarkTokenPayload> {
    const plaintext = await decryptToken(link, {
        userId: sub,
        purpose: "link",
        provider: "embark",
    });
    return JSON.parse(plaintext) as EmbarkTokenPayload;
}

function isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return true;
    const expiresMs = Date.parse(expiresAt);
    return !Number.isFinite(expiresMs) || expiresMs <= Date.now();
}
