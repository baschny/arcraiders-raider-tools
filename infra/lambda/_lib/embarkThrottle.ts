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

const MAX_CONSUME_ATTEMPTS = 3;

export async function consumeTokenBucket(args: {
    ddb: DynamoDBDocumentClient;
    tableName: string;
    pk: string;
    sk: string;
    config: ThrottleConfig;
}): Promise<ThrottleResult> {
    for (let attempt = 0; attempt < MAX_CONSUME_ATTEMPTS; attempt += 1) {
        const now = Date.now();
        const resp = await args.ddb.send(new GetCommand({
            TableName: args.tableName,
            Key: { pk: args.pk, sk: args.sk },
        }));
        const row = resp.Item as ThrottleRow | undefined;
        const previousTokens = typeof row?.tokens === "number" ? row.tokens : args.config.capacity;
        const previousUpdatedAtMs = typeof row?.updatedAtMs === "number" ? row.updatedAtMs : now;
        const intervalMs = args.config.refillIntervalSeconds * 1000;
        const elapsedIntervals = Math.floor((now - previousUpdatedAtMs) / intervalMs);
        const refilledTokens = Math.min(
            args.config.capacity,
            previousTokens + elapsedIntervals * args.config.refillTokens,
        );
        const updatedAtMs = elapsedIntervals > 0
            ? previousUpdatedAtMs + elapsedIntervals * intervalMs
            : previousUpdatedAtMs;

        if (refilledTokens < 1) {
            const nextMs = updatedAtMs + intervalMs;
            return {
                allowed: false,
                remainingTokens: 0,
                retryAfterSeconds: Math.max(1, Math.ceil((nextMs - now) / 1000)),
                nextAllowedAt: new Date(nextMs).toISOString(),
            };
        }

        const nextTokens = refilledTokens - 1;
        try {
            await args.ddb.send(new PutCommand({
                TableName: args.tableName,
                Item: {
                    pk: args.pk,
                    sk: args.sk,
                    tokens: nextTokens,
                    updatedAtMs,
                } satisfies ThrottleRow,
                ...conditionalWriteFor(row),
            }));

            return {
                allowed: true,
                remainingTokens: nextTokens,
            };
        } catch (err) {
            if (!isConditionalWriteConflict(err)) throw err;
        }
    }

    return {
        allowed: false,
        remainingTokens: 0,
        retryAfterSeconds: 1,
        nextAllowedAt: new Date(Date.now() + 1000).toISOString(),
    };
}

function conditionalWriteFor(row: ThrottleRow | undefined) {
    if (!row) {
        return {
            ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
        };
    }
    return {
        ConditionExpression: "#tokens = :previousTokens AND #updatedAtMs = :previousUpdatedAtMs",
        ExpressionAttributeNames: {
            "#tokens": "tokens",
            "#updatedAtMs": "updatedAtMs",
        },
        ExpressionAttributeValues: {
            ":previousTokens": row.tokens,
            ":previousUpdatedAtMs": row.updatedAtMs,
        },
    };
}

function isConditionalWriteConflict(err: unknown): boolean {
    return err instanceof Error && err.name === "ConditionalCheckFailedException";
}
