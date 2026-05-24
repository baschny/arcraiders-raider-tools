import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
} from "@aws-sdk/lib-dynamodb";

export interface ThrottleConfig {
    capacity: number;
    refillIntervalSeconds: number;
    refillTokens: number;
}

export interface ThrottleResult {
    allowed: boolean;
    remainingTokens: number;
    retryAfterSeconds?: number;
    nextAllowedAt?: string;
}

interface ThrottleRow {
    pk: string;
    sk: string;
    tokens: number;
    updatedAtMs: number;
}

export async function consumeTokenBucket(args: {
    ddb: DynamoDBDocumentClient;
    tableName: string;
    pk: string;
    sk: string;
    config: ThrottleConfig;
}): Promise<ThrottleResult> {
    const now = Date.now();
    const resp = await args.ddb.send(new GetCommand({
        TableName: args.tableName,
        Key: { pk: args.pk, sk: args.sk },
    }));
    const row = resp.Item as ThrottleRow | undefined;
    const previousTokens = typeof row?.tokens === "number" ? row.tokens : args.config.capacity;
    const previousUpdatedAtMs = typeof row?.updatedAtMs === "number" ? row.updatedAtMs : now;
    const elapsedIntervals = Math.floor((now - previousUpdatedAtMs) / (args.config.refillIntervalSeconds * 1000));
    const refilledTokens = Math.min(
        args.config.capacity,
        previousTokens + elapsedIntervals * args.config.refillTokens,
    );
    const updatedAtMs = elapsedIntervals > 0
        ? previousUpdatedAtMs + elapsedIntervals * args.config.refillIntervalSeconds * 1000
        : previousUpdatedAtMs;

    if (refilledTokens < 1) {
        const nextMs = updatedAtMs + args.config.refillIntervalSeconds * 1000;
        return {
            allowed: false,
            remainingTokens: 0,
            retryAfterSeconds: Math.max(1, Math.ceil((nextMs - now) / 1000)),
            nextAllowedAt: new Date(nextMs).toISOString(),
        };
    }

    const nextTokens = refilledTokens - 1;
    await args.ddb.send(new PutCommand({
        TableName: args.tableName,
        Item: {
            pk: args.pk,
            sk: args.sk,
            tokens: nextTokens,
            updatedAtMs: now,
        } satisfies ThrottleRow,
    }));

    return {
        allowed: true,
        remainingTokens: nextTokens,
    };
}
