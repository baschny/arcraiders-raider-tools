import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomBytes } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

const s3 = new S3Client({});

export interface StoredSnapshotRefs {
    rawSnapshotId: string;
    rawSnapshotKey?: string;
    normalizedSnapshotKey?: string;
}

export function createSnapshotId(): string {
    return randomBytes(9).toString("base64url");
}

export async function storeEmbarkSnapshots(args: {
    userId: string;
    rawInventory: unknown;
    normalizedSnapshot: unknown;
    syncedAt: string;
    rawSnapshotId: string;
}): Promise<StoredSnapshotRefs> {
    return storeEmbarkResourceSnapshots({
        userId: args.userId,
        resource: "inventory",
        rawPayload: args.rawInventory,
        normalizedSnapshot: args.normalizedSnapshot,
        syncedAt: args.syncedAt,
        rawSnapshotId: args.rawSnapshotId,
    });
}

export async function storeEmbarkQuestSnapshots(args: {
    userId: string;
    rawQuests: unknown;
    normalizedSnapshot: unknown;
    syncedAt: string;
    rawSnapshotId: string;
}): Promise<StoredSnapshotRefs> {
    return storeEmbarkResourceSnapshots({
        userId: args.userId,
        resource: "quests",
        rawPayload: args.rawQuests,
        normalizedSnapshot: args.normalizedSnapshot,
        syncedAt: args.syncedAt,
        rawSnapshotId: args.rawSnapshotId,
    });
}

async function storeEmbarkResourceSnapshots(args: {
    userId: string;
    resource: "inventory" | "quests";
    rawPayload: unknown;
    normalizedSnapshot: unknown;
    syncedAt: string;
    rawSnapshotId: string;
}): Promise<StoredSnapshotRefs> {
    const bucketName = process.env.EMBARK_SNAPSHOT_BUCKET_NAME;
    if (!bucketName || process.env.RAIDER_TOOLS_LOCAL_DEV === "true") {
        return { rawSnapshotId: args.rawSnapshotId };
    }

    const stamp = args.syncedAt.replace(/[:.]/g, "-");
    const date = args.syncedAt.slice(0, 10).replace(/-/g, "/");
    const baseKey = `embark/${args.resource}/${args.userId}/${date}/${stamp}-${args.rawSnapshotId}`;
    const rawSnapshotKey = `${baseKey}.raw.json.gz`;
    const normalizedSnapshotKey = `${baseKey}.normalized.json.gz`;

    await Promise.all([
        putGzippedJson(bucketName, rawSnapshotKey, args.rawPayload),
        putGzippedJson(bucketName, normalizedSnapshotKey, args.normalizedSnapshot),
    ]);

    return {
        rawSnapshotId: args.rawSnapshotId,
        rawSnapshotKey,
        normalizedSnapshotKey,
    };
}

export async function readNormalizedSnapshot<T>(key: string): Promise<T> {
    const bucketName = process.env.EMBARK_SNAPSHOT_BUCKET_NAME;
    if (!bucketName) throw new Error("Missing EMBARK_SNAPSHOT_BUCKET_NAME");
    const resp = await s3.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
    }));
    const body = await resp.Body?.transformToByteArray();
    if (!body) throw new Error("Embark normalized snapshot missing body");
    return JSON.parse(gunzipSync(Buffer.from(body)).toString("utf8")) as T;
}

async function putGzippedJson(bucketName: string, key: string, payload: unknown): Promise<void> {
    await s3.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: gzipSync(Buffer.from(JSON.stringify(payload))),
        ContentType: "application/json",
        ContentEncoding: "gzip",
        CacheControl: "private, max-age=0, no-cache",
    }));
}
