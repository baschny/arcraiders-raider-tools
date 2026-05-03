/**
 * Envelope encryption helpers.
 *
 * On write:
 *   - Ask KMS for a fresh 256-bit data key (`GenerateDataKey`).
 *   - AES-256-GCM encrypt the plaintext with that data key in-process.
 *   - Persist ciphertext + IV + auth-tag + the KMS-encrypted data key.
 *
 * On read:
 *   - Ask KMS to decrypt the stored data key (with the same EncryptionContext).
 *   - AES-256-GCM decrypt the ciphertext locally.
 *
 * EncryptionContext is bound to `{userId, purpose, provider}` so a record
 * cannot be silently swapped between users, and CloudTrail captures intent.
 */

import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from "@aws-sdk/client-kms";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const kms = new KMSClient({});
const LOCAL_DEV_KEY_MARKER = "local-dev:v1";

export interface EnvelopePayload {
    /** Algorithm used. Always `AES-256-GCM` for now. */
    alg: "AES-256-GCM";
    /** Base64-encoded ciphertext (no auth tag appended). */
    ciphertext: string;
    /** Base64-encoded 12-byte IV. */
    iv: string;
    /** Base64-encoded 16-byte GCM auth tag. */
    tag: string;
    /** Base64-encoded KMS-encrypted data key blob. */
    encryptedDataKey: string;
    /** ISO-8601 timestamp of when the record was encrypted. */
    createdAt: string;
}

export interface EnvelopeContext {
    userId: string;
    purpose: string;
    provider: string;
}

function ctxToRecord(ctx: EnvelopeContext): Record<string, string> {
    return {
        userId: ctx.userId,
        purpose: ctx.purpose,
        provider: ctx.provider,
    };
}

export async function encryptToken(
    plaintext: string,
    ctx: EnvelopeContext,
): Promise<EnvelopePayload> {
    if (process.env.RAIDER_TOOLS_LOCAL_DEV === "true") {
        return encryptTokenLocalDev(plaintext);
    }

    const keyId = process.env.KMS_KEY_ID;
    if (!keyId) throw new Error("Missing KMS_KEY_ID");

    const dk = await kms.send(new GenerateDataKeyCommand({
        KeyId: keyId,
        KeySpec: "AES_256",
        EncryptionContext: ctxToRecord(ctx),
    }));
    if (!dk.Plaintext || !dk.CiphertextBlob) {
        throw new Error("KMS GenerateDataKey returned an incomplete response");
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", dk.Plaintext, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Best-effort: zero out the plaintext data key in memory.
    (dk.Plaintext as Uint8Array).fill(0);

    return {
        alg: "AES-256-GCM",
        ciphertext: ct.toString("base64"),
        iv: iv.toString("base64"),
        tag: tag.toString("base64"),
        encryptedDataKey: Buffer.from(dk.CiphertextBlob).toString("base64"),
        createdAt: new Date().toISOString(),
    };
}

export async function decryptToken(
    payload: EnvelopePayload,
    ctx: EnvelopeContext,
): Promise<string> {
    if (payload.encryptedDataKey === LOCAL_DEV_KEY_MARKER) {
        if (process.env.RAIDER_TOOLS_LOCAL_DEV !== "true") {
            throw new Error("Local-dev encrypted token cannot be decrypted outside local dev");
        }
        return decryptTokenLocalDev(payload);
    }

    const dec = await kms.send(new DecryptCommand({
        CiphertextBlob: Buffer.from(payload.encryptedDataKey, "base64"),
        EncryptionContext: ctxToRecord(ctx),
    }));
    if (!dec.Plaintext) throw new Error("KMS Decrypt returned empty plaintext");

    const decipher = createDecipheriv(
        "aes-256-gcm",
        dec.Plaintext,
        Buffer.from(payload.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    const pt = Buffer.concat([
        decipher.update(Buffer.from(payload.ciphertext, "base64")),
        decipher.final(),
    ]);

    (dec.Plaintext as Uint8Array).fill(0);

    return pt.toString("utf8");
}

function localDevKey(): Buffer {
    const secret = process.env.LOCAL_TOKEN_ENCRYPTION_KEY;
    if (!secret) throw new Error("Missing LOCAL_TOKEN_ENCRYPTION_KEY");
    return createHash("sha256").update(secret, "utf8").digest();
}

function encryptTokenLocalDev(plaintext: string): EnvelopePayload {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", localDevKey(), iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
        alg: "AES-256-GCM",
        ciphertext: ct.toString("base64"),
        iv: iv.toString("base64"),
        tag: tag.toString("base64"),
        encryptedDataKey: LOCAL_DEV_KEY_MARKER,
        createdAt: new Date().toISOString(),
    };
}

function decryptTokenLocalDev(payload: EnvelopePayload): string {
    const decipher = createDecipheriv(
        "aes-256-gcm",
        localDevKey(),
        Buffer.from(payload.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    const pt = Buffer.concat([
        decipher.update(Buffer.from(payload.ciphertext, "base64")),
        decipher.final(),
    ]);

    return pt.toString("utf8");
}
