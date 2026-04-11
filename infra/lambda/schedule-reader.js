"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3 = new client_s3_1.S3Client({});
const BUCKET_NAME = process.env.SCHEDULE_BUCKET_NAME ?? "";
const MAP_EVENTS_KEY = process.env.SCHEDULE_KEY ?? "map-events.json";
const HEALTH_KEY = process.env.SCHEDULE_HEALTH_KEY ?? "health.json";
const CACHE_CONTROL_BY_PATH = {
    "/schedule/map-events.json": "public, max-age=300, stale-while-revalidate=300",
    "/schedule/health.json": "public, max-age=60, stale-while-revalidate=60",
};
const KEY_BY_PATH = {
    "/schedule/map-events.json": MAP_EVENTS_KEY,
    "/schedule/health.json": HEALTH_KEY,
};
async function handler(event) {
    const allowedOriginsStr = process.env.ALLOWED_ORIGINS ?? "https://raider-tools.app";
    const allowedOrigins = allowedOriginsStr.split(",").map((origin) => origin.trim());
    const requestOrigin = event.headers?.origin || event.headers?.Origin || "";
    const allowedOrigin = allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];
    if (!BUCKET_NAME) {
        return {
            statusCode: 500,
            headers: {
                ...corsHeaders(allowedOrigin),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ error: "Schedule bucket is not configured" }),
        };
    }
    const path = event.rawPath ?? "";
    const key = KEY_BY_PATH[path];
    if (!key) {
        return {
            statusCode: 404,
            headers: {
                ...corsHeaders(allowedOrigin),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ error: "Unknown schedule resource" }),
        };
    }
    try {
        const objectResponse = await s3.send(new client_s3_1.GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        }));
        const etag = objectResponse.ETag;
        const ifNoneMatch = event.headers?.["if-none-match"] || event.headers?.["If-None-Match"];
        if (etag && ifNoneMatch && ifNoneMatch === etag) {
            return {
                statusCode: 304,
                headers: {
                    ...corsHeaders(allowedOrigin),
                    "Cache-Control": CACHE_CONTROL_BY_PATH[path] ?? "public, max-age=60",
                    ...(etag ? { ETag: etag } : {}),
                },
            };
        }
        const body = await bodyToString(objectResponse.Body);
        return {
            statusCode: 200,
            headers: {
                ...corsHeaders(allowedOrigin),
                "Content-Type": "application/json",
                "Cache-Control": CACHE_CONTROL_BY_PATH[path] ?? "public, max-age=60",
                ...(etag ? { ETag: etag } : {}),
            },
            body,
        };
    }
    catch (error) {
        const serviceError = error;
        if (serviceError?.name === "NoSuchKey" || serviceError?.$metadata?.httpStatusCode === 404) {
            return {
                statusCode: 404,
                headers: {
                    ...corsHeaders(allowedOrigin),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ error: "Schedule resource not found" }),
            };
        }
        console.error("schedule-reader error", {
            message: error?.message,
            name: error?.name,
            path,
            key,
        });
        return {
            statusCode: 500,
            headers: {
                ...corsHeaders(allowedOrigin),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ error: "Failed to load schedule resource" }),
        };
    }
}
function corsHeaders(origin) {
    return {
        "Access-Control-Allow-Origin": origin,
        Vary: "Origin",
    };
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
