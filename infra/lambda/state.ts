/**
 * /me/state/{domain} and /me/migrate — per-user application state.
 *
 * State domains (quests / loot / quartermaster) are stored as opaque JSON
 * blobs in DynamoDB under `pk=USER#<sub>  sk=STATE#<domain>`. Each row
 * carries a `schemaVersion` owned by the frontend, plus a monotonic
 * `revision` used for optimistic concurrency: every successful PUT
 * increments it, and a PUT that supplies a stale `revision` is rejected
 * with 409, returning the current row so the client can reconcile.
 *
 * POST /me/migrate is the one-shot "first sign-in" endpoint. It writes
 * every supplied domain blob (each at `revision = 1`) *and* flips a
 * `dataMigrationCompleted` flag on the PROFILE row in a single
 * transaction; the flag is guarded by a conditional expression so only
 * one device can ever migrate a user.
 */

import type {
    APIGatewayProxyEventV2WithJWTAuthorizer,
    APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    DeleteCommand,
    TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    jsonResponse,
    pickAllowedOrigin,
    jwtSub,
    parseJsonBody,
} from "./_lib/http";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/** The set of state domains the frontend may read/write. */
const ALLOWED_DOMAINS = new Set(["quests", "loot", "quartermaster"]);

/** Hard cap per-domain payload to keep DynamoDB rows small. */
const MAX_DATA_BYTES = 64 * 1024;

interface StateBody {
    schemaVersion: number;
    data: unknown;
    /**
     * Expected server revision. The PUT succeeds only if the stored row
     * has this exact revision (or if the row does not yet exist and
     * `revision` is 0 / omitted). Omitting it skips concurrency checks
     * and is intended for legacy callers only.
     */
    revision?: number;
}

interface MigrateBody {
    quests?: StateBody;
    loot?: StateBody;
    quartermaster?: StateBody;
}

export async function handler(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
    const origin = pickAllowedOrigin(event);
    const sub = jwtSub(event);
    if (!sub) return jsonResponse(401, { error: "Unauthenticated" }, origin);

    const tableName = process.env.USER_TABLE_NAME!;
    const path = event.rawPath || "";
    const method = event.requestContext.http.method;

    try {
        if (path.endsWith("/me/migrate") && method === "POST") {
            return await handleMigrate(tableName, sub, event.body ?? null, origin);
        }

        // /me/state/{domain}
        const domain = event.pathParameters?.domain;
        if (!domain || !ALLOWED_DOMAINS.has(domain)) {
            return jsonResponse(400, { error: `Unknown state domain: ${domain ?? "<missing>"}` }, origin);
        }

        if (method === "GET") return await handleGet(tableName, sub, domain, origin);
        if (method === "PUT") return await handlePut(tableName, sub, domain, event.body ?? null, origin);
        if (method === "DELETE") return await handleDelete(tableName, sub, domain, origin);

        return jsonResponse(405, { error: "Method not allowed" }, origin);
    } catch (err) {
        const e = err as Error;
        console.error("StateFn error", { message: e.message, name: e.name, path, method });
        return jsonResponse(500, { error: "Internal error" }, origin);
    }
}

// ---------------------------------------------------------------------------
// GET / PUT / DELETE /me/state/{domain}
// ---------------------------------------------------------------------------
async function handleGet(
    tableName: string,
    sub: string,
    domain: string,
    origin: string,
): Promise<APIGatewayProxyResultV2> {
    const r = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { pk: `USER#${sub}`, sk: `STATE#${domain}` },
    }));
    if (!r.Item) return jsonResponse(404, { error: "Not found" }, origin);
    return jsonResponse(200, {
        schemaVersion: r.Item.schemaVersion ?? 1,
        data: r.Item.data ?? null,
        revision: typeof r.Item.revision === "number" ? r.Item.revision : 1,
        updatedAt: r.Item.updatedAt ?? null,
    }, origin);
}

async function handlePut(
    tableName: string,
    sub: string,
    domain: string,
    rawBody: string | null,
    origin: string,
): Promise<APIGatewayProxyResultV2> {
    const body = parseJsonBody<StateBody>(rawBody);
    const validation = validateStateBody(body);
    if (!validation.ok) return jsonResponse(400, { error: validation.error }, origin);

    const now = new Date().toISOString();
    const expectedRevision = body!.revision;

    // Branch on whether the caller provided an expected revision.
    //
    //   expectedRevision missing / 0  -> row must not yet exist; create at rev 1.
    //   expectedRevision > 0          -> row must exist with that exact
    //                                    revision; increment to +1 on success.
    try {
        if (!expectedRevision) {
            await ddb.send(new PutCommand({
                TableName: tableName,
                Item: {
                    pk: `USER#${sub}`,
                    sk: `STATE#${domain}`,
                    schemaVersion: body!.schemaVersion,
                    data: body!.data,
                    revision: 1,
                    updatedAt: now,
                },
                ConditionExpression: "attribute_not_exists(pk)",
            }));
            return jsonResponse(200, { ok: true, revision: 1 }, origin);
        }

        const nextRevision = expectedRevision + 1;
        await ddb.send(new PutCommand({
            TableName: tableName,
            Item: {
                pk: `USER#${sub}`,
                sk: `STATE#${domain}`,
                schemaVersion: body!.schemaVersion,
                data: body!.data,
                revision: nextRevision,
                updatedAt: now,
            },
            ConditionExpression: "#rev = :expected",
            ExpressionAttributeNames: { "#rev": "revision" },
            ExpressionAttributeValues: { ":expected": expectedRevision },
        }));
        return jsonResponse(200, { ok: true, revision: nextRevision }, origin);
    } catch (err) {
        const e = err as { name?: string };
        if (e.name === "ConditionalCheckFailedException") {
            // Return the current server row so the client can reconcile
            // without an extra GET round-trip.
            const current = await ddb.send(new GetCommand({
                TableName: tableName,
                Key: { pk: `USER#${sub}`, sk: `STATE#${domain}` },
            }));
            return jsonResponse(409, {
                error: "revision_conflict",
                current: current.Item
                    ? {
                        schemaVersion: current.Item.schemaVersion ?? 1,
                        data: current.Item.data ?? null,
                        revision: typeof current.Item.revision === "number" ? current.Item.revision : 1,
                        updatedAt: current.Item.updatedAt ?? null,
                    }
                    : null,
            }, origin);
        }
        throw err;
    }
}

async function handleDelete(
    tableName: string,
    sub: string,
    domain: string,
    origin: string,
): Promise<APIGatewayProxyResultV2> {
    await ddb.send(new DeleteCommand({
        TableName: tableName,
        Key: { pk: `USER#${sub}`, sk: `STATE#${domain}` },
    }));
    return jsonResponse(200, { ok: true }, origin);
}

// ---------------------------------------------------------------------------
// POST /me/migrate
// ---------------------------------------------------------------------------
async function handleMigrate(
    tableName: string,
    sub: string,
    rawBody: string | null,
    origin: string,
): Promise<APIGatewayProxyResultV2> {
    const body = parseJsonBody<MigrateBody>(rawBody);
    if (!body || typeof body !== "object") {
        return jsonResponse(400, { error: "Invalid JSON body" }, origin);
    }

    // Validate every supplied domain blob.
    const domainEntries = Object.entries(body) as [keyof MigrateBody, StateBody | undefined][];
    const validDomains: { domain: string; payload: StateBody }[] = [];
    for (const [domain, payload] of domainEntries) {
        if (payload === undefined) continue;
        if (!ALLOWED_DOMAINS.has(domain)) {
            return jsonResponse(400, { error: `Unknown state domain: ${domain}` }, origin);
        }
        const validation = validateStateBody(payload);
        if (!validation.ok) {
            return jsonResponse(400, { error: `Invalid payload for ${domain}: ${validation.error}` }, origin);
        }
        validDomains.push({ domain, payload });
    }

    const now = new Date().toISOString();

    // One transaction: flip the migration flag on PROFILE (guarded by a
    // conditional expression so only one device wins) + write all supplied
    // domain rows. If the flag was already true, the whole transaction is
    // rolled back and we respond 409 so the client falls through to the
    // server-wins download path.
    try {
        await ddb.send(new TransactWriteCommand({
            TransactItems: [
                {
                    Update: {
                        TableName: tableName,
                        Key: { pk: `USER#${sub}`, sk: "PROFILE" },
                        UpdateExpression:
                            "SET dataMigrationCompleted = :true, dataMigrationAt = :now, " +
                            "createdAt = if_not_exists(createdAt, :now)",
                        ConditionExpression:
                            "attribute_not_exists(dataMigrationCompleted) OR dataMigrationCompleted = :false",
                        ExpressionAttributeValues: {
                            ":true": true,
                            ":false": false,
                            ":now": now,
                        },
                    },
                },
                ...validDomains.map(({ domain, payload }) => ({
                    Put: {
                        TableName: tableName,
                        Item: {
                            pk: `USER#${sub}`,
                            sk: `STATE#${domain}`,
                            schemaVersion: payload.schemaVersion,
                            data: payload.data,
                            // Initialize the optimistic-concurrency
                            // revision so subsequent PUTs have a value
                            // to match against.
                            revision: 1,
                            updatedAt: now,
                        },
                    },
                })),
            ],
        }));
    } catch (err) {
        const e = err as { name?: string; message?: string; CancellationReasons?: { Code?: string }[] };
        const wasConditional = e.name === "TransactionCanceledException"
            && !!e.CancellationReasons?.some(r => r.Code === "ConditionalCheckFailed");
        if (wasConditional) {
            return jsonResponse(409, {
                migrated: false,
                reason: "already_migrated",
            }, origin);
        }
        throw err;
    }

    return jsonResponse(200, { migrated: true }, origin);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function validateStateBody(body: StateBody | null | undefined):
    | { ok: true }
    | { ok: false; error: string } {
    if (!body || typeof body !== "object") return { ok: false, error: "Missing body" };
    if (typeof body.schemaVersion !== "number" || !Number.isInteger(body.schemaVersion) || body.schemaVersion < 1) {
        return { ok: false, error: "schemaVersion must be a positive integer" };
    }
    if (body.data === undefined || body.data === null) {
        return { ok: false, error: "data is required" };
    }
    try {
        const size = Buffer.byteLength(JSON.stringify(body.data), "utf8");
        if (size > MAX_DATA_BYTES) {
            return { ok: false, error: `data exceeds ${MAX_DATA_BYTES} bytes (was ${size})` };
        }
    } catch {
        return { ok: false, error: "data is not JSON-serializable" };
    }
    return { ok: true };
}
