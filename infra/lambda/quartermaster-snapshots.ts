/**
 * Operator-only Quartermaster tutorial snapshots.
 *
 * Full gameplay payloads are stored gzipped in S3 in production and inline in
 * DynamoDB Local. Metadata stays in the existing per-user partition.
 */
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomBytes } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { jsonResponse, jwtEmail, jwtSub, parseJsonBody, pickAllowedOrigin } from "./_lib/http";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const PREFIX = "QM_SNAPSHOT#";
const MAX_SNAPSHOTS = 100;
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;
const SNAPSHOT_SCHEMA_VERSION = 1;

interface SnapshotPayload {
    snapshotSchemaVersion: number;
    source: "arctracker";
    gameplay: {
        stash: unknown;
        loadout: unknown;
        blueprints: unknown;
        hideout: { modules?: unknown[] };
        quests: { source?: unknown; questsById?: Record<string, { completed?: unknown }> };
        projects: unknown;
    };
    quartermaster: Record<string, unknown>;
    playerLevel?: number | null;
}

interface CreateBody {
    name: string;
    description?: string | null;
    payload: SnapshotPayload;
}

interface SnapshotMetadata {
    pk: string;
    sk: string;
    snapshotId: string;
    snapshotSchemaVersion: number;
    source: "arctracker";
    name: string;
    description: string | null;
    createdAt: string;
    playerLevel: number | null;
    payloadKey?: string;
    payload?: SnapshotPayload;
    ownedItemQuantities: Record<string, number>;
    hideoutModules: Array<{ moduleId: string; currentLevel: number; maxLevel: number }>;
    completedQuestIds: string[];
}

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
    const origin = pickAllowedOrigin(event);
    const sub = jwtSub(event);
    const email = jwtEmail(event)?.trim().toLowerCase();
    const allowedEmail = (process.env.SNAPSHOT_ALLOWED_EMAIL ?? "").trim().toLowerCase();
    if (!sub) return jsonResponse(401, { error: "Unauthenticated" }, origin);
    if (!allowedEmail) return jsonResponse(503, { error: "Snapshot access is not configured" }, origin);
    if (email !== allowedEmail) return jsonResponse(403, { error: "Snapshot access is not available for this account" }, origin);

    const method = event.requestContext.http.method;
    const id = event.pathParameters?.snapshotId;
    try {
        if (method === "GET" && !id) return await listSnapshots(sub, origin);
        if (method === "POST" && !id) return await createSnapshot(sub, event.body ?? null, origin);
        if (method === "POST" && id && event.rawPath.endsWith("/restore")) return await restoreSnapshot(sub, id, origin);
        if (method === "DELETE" && id) return await deleteSnapshot(sub, id, origin);
        return jsonResponse(405, { error: "Method not allowed" }, origin);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown snapshot error";
        console.error("QuartermasterSnapshotsFn error", { message, method, id });
        return jsonResponse(500, { error: "Internal error" }, origin);
    }
}

async function listSnapshots(sub: string, origin: string): Promise<APIGatewayProxyResultV2> {
    const result = await ddb.send(new QueryCommand({
        TableName: process.env.USER_TABLE_NAME!,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: { ":pk": `USER#${sub}`, ":prefix": PREFIX },
        ScanIndexForward: false,
        Limit: MAX_SNAPSHOTS,
    }));
    return jsonResponse(200, { snapshots: (result.Items ?? []).map(item => toPublicMetadata(item as SnapshotMetadata)) }, origin);
}

async function createSnapshot(sub: string, raw: string | null, origin: string): Promise<APIGatewayProxyResultV2> {
    if (raw && Buffer.byteLength(raw, "utf8") > MAX_PAYLOAD_BYTES) {
        return jsonResponse(400, { error: "Snapshot payload is too large" }, origin);
    }
    const body = parseJsonBody<CreateBody>(raw);
    const validation = validateCreate(body);
    if (!validation.ok) return jsonResponse(400, { error: validation.error }, origin);

    const existing = await ddb.send(new QueryCommand({
        TableName: process.env.USER_TABLE_NAME!,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: { ":pk": `USER#${sub}`, ":prefix": PREFIX },
        Select: "COUNT",
        ConsistentRead: true,
    }));
    if ((existing.Count ?? 0) >= MAX_SNAPSHOTS) {
        return jsonResponse(409, { error: `Snapshot limit of ${MAX_SNAPSHOTS} reached` }, origin);
    }

    const snapshotId = `${Date.now().toString(36)}-${randomBytes(9).toString("base64url")}`;
    const payload = body!.payload;
    const metadata: SnapshotMetadata = {
        pk: `USER#${sub}`,
        sk: `${PREFIX}${snapshotId}`,
        snapshotId,
        snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
        source: "arctracker",
        name: body!.name.trim(),
        description: body!.description?.trim() || null,
        createdAt: new Date().toISOString(),
        playerLevel: typeof payload.playerLevel === "number" ? payload.playerLevel : null,
        ownedItemQuantities: collectOwnedQuantities(payload.gameplay.stash, payload.gameplay.loadout),
        hideoutModules: collectHideoutModules(payload.gameplay.hideout),
        completedQuestIds: collectCompletedQuestIds(payload.gameplay.quests),
    };

    if (isLocal()) {
        metadata.payload = payload;
    } else {
        metadata.payloadKey = `quartermaster/tutorial-snapshots/${sub}/${snapshotId}.json.gz`;
        await s3.send(new PutObjectCommand({
            Bucket: process.env.QUARTERMASTER_SNAPSHOT_BUCKET_NAME!,
            Key: metadata.payloadKey,
            Body: gzipSync(JSON.stringify(payload)),
            ContentType: "application/json",
            ContentEncoding: "gzip",
            CacheControl: "private, max-age=0, no-cache",
        }));
    }

    try {
        await ddb.send(new PutCommand({
            TableName: process.env.USER_TABLE_NAME!,
            Item: metadata,
            ConditionExpression: "attribute_not_exists(pk)",
        }));
    } catch (error) {
        if (metadata.payloadKey) await deletePayload(metadata.payloadKey).catch(() => undefined);
        throw error;
    }
    return jsonResponse(201, { snapshot: toPublicMetadata(metadata) }, origin);
}

async function restoreSnapshot(sub: string, snapshotId: string, origin: string): Promise<APIGatewayProxyResultV2> {
    const metadata = await getMetadata(sub, snapshotId);
    if (!metadata) return jsonResponse(404, { error: "Snapshot not found" }, origin);
    const payload = await readPayload(metadata);
    const payloadError = validatePayload(payload);
    if (payloadError) return jsonResponse(400, { error: payloadError }, origin);

    const current = await ddb.send(new GetCommand({
        TableName: process.env.USER_TABLE_NAME!,
        Key: { pk: `USER#${sub}`, sk: "STATE#quartermaster" },
    }));
    const currentData = asObject(current.Item?.data);
    const restoredData = {
        ...payload.quartermaster,
        weaponBuilds: Array.isArray(currentData.weaponBuilds) ? currentData.weaponBuilds : [],
        projectView: asObject(currentData.projectView),
    };
    const currentRevision = typeof current.Item?.revision === "number" ? current.Item.revision : 0;
    const now = new Date().toISOString();
    const stateItem = {
        pk: `USER#${sub}`,
        sk: "STATE#quartermaster",
        schemaVersion: 5,
        data: restoredData,
        revision: currentRevision + 1,
        updatedAt: now,
    };
    await ddb.send(new TransactWriteCommand({
        TransactItems: [
            { Put: { TableName: process.env.USER_TABLE_NAME!, Item: stateItem } },
            {
                Update: {
                    TableName: process.env.USER_TABLE_NAME!,
                    Key: { pk: `USER#${sub}`, sk: "PROFILE" },
                    UpdateExpression: "SET gameDataSource = :source, createdAt = if_not_exists(createdAt, :now)",
                    ExpressionAttributeValues: { ":source": "arctracker", ":now": now },
                },
            },
        ],
    }));
    return jsonResponse(200, {
        snapshot: toPublicMetadata(metadata),
        restoredAt: now,
        payload,
        quartermaster: { schemaVersion: 5, data: restoredData, revision: currentRevision + 1, updatedAt: now },
    }, origin);
}

async function deleteSnapshot(sub: string, snapshotId: string, origin: string): Promise<APIGatewayProxyResultV2> {
    const metadata = await getMetadata(sub, snapshotId);
    if (!metadata) return jsonResponse(404, { error: "Snapshot not found" }, origin);
    if (metadata.payloadKey) await deletePayload(metadata.payloadKey);
    await ddb.send(new DeleteCommand({
        TableName: process.env.USER_TABLE_NAME!,
        Key: { pk: metadata.pk, sk: metadata.sk },
    }));
    return jsonResponse(200, { ok: true }, origin);
}

async function getMetadata(sub: string, snapshotId: string): Promise<SnapshotMetadata | null> {
    const result = await ddb.send(new GetCommand({
        TableName: process.env.USER_TABLE_NAME!,
        Key: { pk: `USER#${sub}`, sk: `${PREFIX}${snapshotId}` },
    }));
    return result.Item ? result.Item as SnapshotMetadata : null;
}

async function readPayload(metadata: SnapshotMetadata): Promise<SnapshotPayload> {
    if (metadata.payload) return metadata.payload;
    if (!metadata.payloadKey) throw new Error("Snapshot payload is missing");
    const response = await s3.send(new GetObjectCommand({
        Bucket: process.env.QUARTERMASTER_SNAPSHOT_BUCKET_NAME!, Key: metadata.payloadKey,
    }));
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) throw new Error("Snapshot payload is missing");
    return JSON.parse(gunzipSync(Buffer.from(bytes)).toString("utf8")) as SnapshotPayload;
}

async function deletePayload(key: string): Promise<void> {
    await s3.send(new DeleteObjectCommand({ Bucket: process.env.QUARTERMASTER_SNAPSHOT_BUCKET_NAME!, Key: key }));
}

function validateCreate(body: CreateBody | null): { ok: true } | { ok: false; error: string } {
    if (!body || typeof body !== "object") return { ok: false, error: "Invalid JSON body" };
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 80) return { ok: false, error: "Name must be 1 to 80 characters" };
    if (body.description !== undefined && body.description !== null && (typeof body.description !== "string" || body.description.length > 500)) return { ok: false, error: "Description must be at most 500 characters" };
    const error = validatePayload(body.payload);
    return error ? { ok: false, error } : { ok: true };
}

function validatePayload(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") return "Snapshot payload is required";
    const p = payload as Partial<SnapshotPayload>;
    if (p.snapshotSchemaVersion !== SNAPSHOT_SCHEMA_VERSION) return "Unsupported snapshot version";
    if (p.source !== "arctracker") return "Snapshots require ArcTracker data";
    if (!p.gameplay || !p.quartermaster) return "Snapshot payload is incomplete";
    const game = p.gameplay as Record<string, unknown>;
    for (const key of ["stash", "loadout", "blueprints", "hideout", "quests", "projects"]) {
        if (!game[key]) return `Snapshot is missing ${key}`;
    }
    if ((game.quests as { source?: unknown }).source !== "arctracker") return "Snapshots require ArcTracker quest data";
    return null;
}

function collectOwnedQuantities(stash: unknown, loadout: unknown): Record<string, number> {
    const quantities: Record<string, number> = {};
    const add = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        const item = value as { itemId?: unknown; quantity?: unknown; attachments?: unknown };
        if (typeof item.itemId === "string" && typeof item.quantity === "number" && item.quantity > 0) {
            quantities[item.itemId] = (quantities[item.itemId] ?? 0) + item.quantity;
        }
        if (Array.isArray(item.attachments)) item.attachments.forEach(add);
    };
    const stashItems = (stash as { items?: unknown[] } | null)?.items;
    if (Array.isArray(stashItems)) stashItems.forEach(add);
    const walkLoadout = (value: unknown): void => {
        if (Array.isArray(value)) return value.forEach(walkLoadout);
        if (!value || typeof value !== "object") return;
        const record = value as Record<string, unknown>;
        if ("itemId" in record) add(record);
        for (const [key, child] of Object.entries(record)) if (key !== "attachments" && key !== "slotCounts") walkLoadout(child);
    };
    walkLoadout((loadout as { loadout?: unknown } | null)?.loadout);
    return quantities;
}

function collectHideoutModules(hideout: unknown): SnapshotMetadata["hideoutModules"] {
    const modules = (hideout as { modules?: unknown[] } | null)?.modules;
    if (!Array.isArray(modules)) return [];
    return modules.flatMap((raw) => {
        const m = raw as Record<string, unknown>;
        return typeof m.moduleId === "string" && typeof m.currentLevel === "number" && typeof m.maxLevel === "number"
            ? [{ moduleId: m.moduleId, currentLevel: m.currentLevel, maxLevel: m.maxLevel }]
            : [];
    });
}

function collectCompletedQuestIds(quests: unknown): string[] {
    const entries = (quests as { questsById?: Record<string, { completed?: unknown }> } | null)?.questsById ?? {};
    return Object.entries(entries).flatMap(([id, entry]) => entry?.completed === true ? [id] : []);
}

function asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toPublicMetadata(item: SnapshotMetadata): Omit<SnapshotMetadata, "pk" | "sk" | "payloadKey" | "payload"> {
    const { pk: _pk, sk: _sk, payloadKey: _key, payload: _payload, ...metadata } = item;
    return metadata;
}

function isLocal(): boolean {
    return process.env.RAIDER_TOOLS_LOCAL_DEV === "true";
}
