import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
    APIGatewayProxyEventV2WithJWTAuthorizer,
    APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

const mocks = vi.hoisted(() => ({
    ddbSend: vi.fn(),
    consumeTokenBucket: vi.fn(),
    fetchEmbarkQuests: vi.fn(),
    getEmbarkRequestConfig: vi.fn(),
    decryptToken: vi.fn(),
    createSnapshotId: vi.fn(),
    readNormalizedSnapshot: vi.fn(),
    storeEmbarkQuestSnapshots: vi.fn(),
    decodeEmbarkQuests: vi.fn(),
    hasJwtGroup: vi.fn(),
    jwtSub: vi.fn(),
    pickAllowedOrigin: vi.fn(),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
    DynamoDBClient: class DynamoDBClient {},
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
    DynamoDBDocumentClient: {
        from: () => ({ send: mocks.ddbSend }),
    },
    GetCommand: class GetCommand {
        input: unknown;
        constructor(input: unknown) {
            this.input = input;
        }
    },
    PutCommand: class PutCommand {
        input: unknown;
        constructor(input: unknown) {
            this.input = input;
        }
    },
}));

vi.mock("../_lib/http", () => ({
    hasJwtGroup: mocks.hasJwtGroup,
    jwtSub: mocks.jwtSub,
    pickAllowedOrigin: mocks.pickAllowedOrigin,
    jsonResponse: (statusCode: number, body: unknown, origin?: string, headers?: Record<string, string>) => ({
        statusCode,
        body: JSON.stringify(body),
        headers: {
            ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
            ...headers,
        },
    }),
}));

vi.mock("../_lib/embarkThrottle", () => ({
    consumeTokenBucket: mocks.consumeTokenBucket,
}));

vi.mock("../_lib/embark", () => ({
    fetchEmbarkQuests: mocks.fetchEmbarkQuests,
    getEmbarkRequestConfig: mocks.getEmbarkRequestConfig,
}));

vi.mock("../_lib/envelope", () => ({
    decryptToken: mocks.decryptToken,
}));

vi.mock("../_lib/embarkSnapshotStorage", () => ({
    createSnapshotId: mocks.createSnapshotId,
    readNormalizedSnapshot: mocks.readNormalizedSnapshot,
    storeEmbarkQuestSnapshots: mocks.storeEmbarkQuestSnapshots,
}));

vi.mock("../_lib/embarkQuestDecode", () => ({
    decodeEmbarkQuests: mocks.decodeEmbarkQuests,
}));

import { handler } from "../embark-quests";

function makeEvent(method: "GET" | "POST"): APIGatewayProxyEventV2WithJWTAuthorizer {
    return {
        headers: { origin: "http://localhost:5173" },
        requestContext: {
            http: { method },
        },
    } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

function asStructuredResult(result: Awaited<ReturnType<typeof handler>>): APIGatewayProxyStructuredResultV2 {
    expect(typeof result).toBe("object");
    return result as APIGatewayProxyStructuredResultV2;
}

function parseBody(result: APIGatewayProxyStructuredResultV2) {
    return JSON.parse(result.body ?? "{}") as Record<string, unknown>;
}

describe("embark-quests handler", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.USER_TABLE_NAME = "raider-tools-users";
        mocks.hasJwtGroup.mockReturnValue(true);
        mocks.jwtSub.mockReturnValue("user-sub-1");
        mocks.pickAllowedOrigin.mockReturnValue("http://localhost:5173");
        mocks.getEmbarkRequestConfig.mockResolvedValue({});
        mocks.createSnapshotId.mockReturnValue("raw-snapshot-id");
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("returns 401 when the user is not linked", async () => {
        mocks.ddbSend.mockResolvedValueOnce({ Item: undefined });

        const result = asStructuredResult(await handler(makeEvent("POST")));

        expect(result.statusCode).toBe(401);
        expect(parseBody(result)).toEqual({ error: "not_linked" });
    });

    it("returns 401 when the linked token is expired", async () => {
        mocks.ddbSend.mockResolvedValueOnce({
            Item: { expiresAt: "2026-05-25T10:00:00.000Z" },
        });

        const result = asStructuredResult(await handler(makeEvent("POST")));

        expect(result.statusCode).toBe(401);
        expect(parseBody(result)).toEqual({ error: "token_expired" });
    });

    it("returns 429 when the user throttle bucket blocks the sync", async () => {
        mocks.ddbSend.mockResolvedValueOnce({
            Item: { expiresAt: "2026-05-27T10:00:00.000Z" },
        });
        mocks.consumeTokenBucket.mockResolvedValueOnce({
            allowed: false,
            retryAfterSeconds: 30,
            nextAllowedAt: "2026-05-26T12:30:00.000Z",
            remainingTokens: 0,
        });

        const result = asStructuredResult(await handler(makeEvent("POST")));

        expect(result.statusCode).toBe(429);
        expect(parseBody(result)).toMatchObject({
            error: "rate_limited_user",
            nextAllowedAt: "2026-05-26T12:30:00.000Z",
        });
    });

    it("returns 429 when the global throttle bucket blocks the sync", async () => {
        mocks.ddbSend.mockResolvedValueOnce({
            Item: { expiresAt: "2026-05-27T10:00:00.000Z" },
        });
        mocks.consumeTokenBucket
            .mockResolvedValueOnce({ allowed: true })
            .mockResolvedValueOnce({
                allowed: false,
                retryAfterSeconds: 15,
                nextAllowedAt: "2026-05-26T12:15:00.000Z",
                remainingTokens: 0,
            });

        const result = asStructuredResult(await handler(makeEvent("POST")));

        expect(result.statusCode).toBe(429);
        expect(parseBody(result)).toMatchObject({
            error: "rate_limited_global",
            nextAllowedAt: "2026-05-26T12:15:00.000Z",
        });
    });

    it("writes the latest quests row on a successful sync", async () => {
        const snapshot = {
            source: "embark",
            syncedAt: "2026-05-26T12:00:00.000Z",
            cachedAt: 1748260800000,
            schemaVersion: 1,
            rawSnapshotId: "raw-snapshot-id",
            questsById: {
                cold_storage: { state: "completed", completed: true },
            },
        };

        mocks.ddbSend.mockResolvedValueOnce({
            Item: { expiresAt: "2026-05-27T10:00:00.000Z" },
        }).mockResolvedValueOnce({});
        mocks.consumeTokenBucket
            .mockResolvedValueOnce({ allowed: true })
            .mockResolvedValueOnce({ allowed: true });
        mocks.decryptToken.mockResolvedValue(JSON.stringify({ access_token: "access-token-1" }));
        mocks.fetchEmbarkQuests.mockResolvedValue({});
        mocks.decodeEmbarkQuests.mockReturnValue(snapshot);
        mocks.storeEmbarkQuestSnapshots.mockResolvedValue({
            rawSnapshotKey: "embark/quests/raw.json",
            normalizedSnapshotKey: "embark/quests/normalized.json",
        });

        const result = asStructuredResult(await handler(makeEvent("POST")));

        expect(result.statusCode).toBe(200);
        expect(mocks.decodeEmbarkQuests).toHaveBeenCalledWith({
            quests: [],
        }, expect.objectContaining({
            rawSnapshotId: "raw-snapshot-id",
        }));
        expect(mocks.ddbSend).toHaveBeenCalledTimes(2);

        const putInput = (mocks.ddbSend.mock.calls[1]?.[0] as { input: Record<string, unknown> }).input;
        expect(putInput).toMatchObject({
            TableName: "raider-tools-users",
            Item: expect.objectContaining({
                pk: "USER#user-sub-1",
                sk: "EMBARK#QUESTS#LATEST",
                source: "embark",
                schemaVersion: 1,
                rawSnapshotId: "raw-snapshot-id",
                rawSnapshotKey: "embark/quests/raw.json",
                normalizedSnapshotKey: "embark/quests/normalized.json",
            }),
        });
        expect(parseBody(result)).toEqual(snapshot);
    });

    it("returns 404 on GET when no latest row exists", async () => {
        mocks.ddbSend.mockResolvedValueOnce({ Item: undefined });

        const result = asStructuredResult(await handler(makeEvent("GET")));

        expect(result.statusCode).toBe(404);
        expect(parseBody(result)).toEqual({ error: "not_synced" });
    });

    it("returns the cached snapshot on GET when a latest row exists", async () => {
        const snapshot = {
            source: "embark",
            syncedAt: "2026-05-26T12:00:00.000Z",
            cachedAt: 1748260800000,
            schemaVersion: 1,
            rawSnapshotId: "raw-snapshot-id",
            questsById: {
                cold_storage: { state: "completed", completed: true },
            },
        };
        mocks.ddbSend.mockResolvedValueOnce({
            Item: {
                pk: "USER#user-sub-1",
                sk: "EMBARK#QUESTS#LATEST",
                source: "embark",
                syncedAt: "2026-05-26T12:00:00.000Z",
                cachedAt: 1748260800000,
                schemaVersion: 1,
                rawSnapshotId: "raw-snapshot-id",
                snapshot,
                updatedAt: "2026-05-26T12:00:00.000Z",
            },
        });

        const result = asStructuredResult(await handler(makeEvent("GET")));

        expect(result.statusCode).toBe(200);
        expect(parseBody(result)).toEqual(snapshot);
    });
});
