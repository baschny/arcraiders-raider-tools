/**
 * Local API server for raider-tools development.
 *
 * Mirrors the production API Gateway + Lambda stack on a single Node
 * process by dispatching HTTP requests to the same handlers used in
 * production (`infra/lambda/profile.ts`, `state.ts`, `links.ts`,
 * `arctracker-user-proxy.ts`). The
 * handlers talk to DynamoDB Local (via `AWS_ENDPOINT_URL_DYNAMODB`)
 * instead of the real DynamoDB, and the JWT authorizer is replaced by
 * a trivial dev-token scheme understood by `src/shared/auth/devAuthClient.ts`.
 *
 * This is a *dev-only* server. It deliberately:
 *   - Uses a permissive CORS policy for the local Vite dev server.
 *   - Does not validate JWTs (the dev token is not signed).
 *   - Creates the `raider-tools-users` table with a minimal schema
 *     (pk/sk + ttl). If the real CDK stack diverges, update
 *     `ensureTable()` below to match.
 *
 * Run with:
 *   # Terminal 1
 *   npm run local:ddb     # starts DynamoDB Local via docker compose
 *   # Terminal 2
 *   npm run local:api     # starts this server on port 4000
 *   # Terminal 3 (repo root)
 *   npm run dev           # starts Vite with VITE_DEV_AUTH=true in .env.local
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
    APIGatewayProxyEventV2WithJWTAuthorizer,
    APIGatewayProxyResultV2,
    APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
    DynamoDBClient,
    CreateTableCommand,
    DescribeTableCommand,
    ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";

// ---------------------------------------------------------------------------
// Environment defaults
//
// The SDK env vars are set *before* importing the handler modules, which
// each construct their own DynamoDBDocumentClient at module-scope. If we
// set them later the clients would already be pinned to a different
// (missing) endpoint and would fail to connect to DynamoDB Local.
// ---------------------------------------------------------------------------
loadLocalEnv();

const LOCAL_API_PORT = Number(process.env.LOCAL_API_PORT ?? 4000);
const DDB_ENDPOINT = process.env.AWS_ENDPOINT_URL_DYNAMODB ?? "http://localhost:8000";
const TABLE_NAME = process.env.USER_TABLE_NAME ?? "raider-tools-users";
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ?? "http://localhost:5173";
const AWS_REGION = process.env.AWS_REGION ?? "eu-central-1";

process.env.AWS_REGION = AWS_REGION;
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ?? "local";
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? "local";
process.env.AWS_ENDPOINT_URL_DYNAMODB = DDB_ENDPOINT;
process.env.USER_TABLE_NAME = TABLE_NAME;
process.env.ALLOWED_ORIGINS = ALLOWED_ORIGINS;
process.env.RAIDER_TOOLS_LOCAL_DEV = "true";
process.env.LOCAL_TOKEN_ENCRYPTION_KEY = process.env.LOCAL_TOKEN_ENCRYPTION_KEY ?? "raider-tools-local-dev-token-key";
function loadLocalEnv(): void {
    const envPath = resolve(__dirname, "..", ".env");
    if (!existsSync(envPath)) return;

    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const equals = trimmed.indexOf("=");
        if (equals <= 0) continue;

        const key = trimmed.slice(0, equals).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) {
            continue;
        }

        process.env[key] = parseEnvValue(trimmed.slice(equals + 1).trim());
    }
}

function parseEnvValue(raw: string): string {
    if (
        (raw.startsWith("\"") && raw.endsWith("\"")) ||
        (raw.startsWith("'") && raw.endsWith("'"))
    ) {
        return raw.slice(1, -1);
    }

    const comment = raw.indexOf(" #");
    return (comment >= 0 ? raw.slice(0, comment) : raw).trim();
}

/* eslint-disable @typescript-eslint/no-require-imports */
// Imports are intentionally deferred until after env setup so that each
// handler module picks up the local endpoint on its own DynamoDB client.
const profile = require("../lambda/profile");
const state = require("../lambda/state");
const links = require("../lambda/links");
const arctrackerUserProxy = require("../lambda/arctracker-user-proxy");
/* eslint-enable @typescript-eslint/no-require-imports */

// ---------------------------------------------------------------------------
// Table bootstrap
// ---------------------------------------------------------------------------

const ddb = new DynamoDBClient({
    endpoint: DDB_ENDPOINT,
    region: AWS_REGION,
    credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

async function ensureTable(): Promise<void> {
    const maxRetries = 10;
    const retryDelay = 1000;

    for (let i = 0; i < maxRetries; i++) {
        try {
            await ddb.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
            return;
        } catch (err) {
            // If table doesn't exist, we need to create it (proceed after the loop)
            if (err instanceof ResourceNotFoundException) {
                break;
            }

            const error = err as { code?: string; name?: string; message?: string };
            // If it's a connection error, retry
            if (error.code === "ECONNRESET" || error.name === "TimeoutError" || error.message?.includes("ECONNRESET") || error.message?.includes("socket hang up")) {
                console.log(`[local-api] waiting for dynamodb... (attempt ${i + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                continue;
            }

            throw err;
        }
    }

    // Minimal schema: pk/sk only. Keep in sync with the CDK table
    // definition in infra/lib/raider-tools-stack.ts — this local
    // version intentionally omits PITR + KMS + TTL attribute (TTL is
    // only enforced on NONCE#* rows which are an auth-layer concern
    // not exercised locally).
    console.log(`[local-api] creating table ${TABLE_NAME} on ${DDB_ENDPOINT}`);
    await ddb.send(new CreateTableCommand({
        TableName: TABLE_NAME,
        AttributeDefinitions: [
            { AttributeName: "pk", AttributeType: "S" },
            { AttributeName: "sk", AttributeType: "S" },
        ],
        KeySchema: [
            { AttributeName: "pk", KeyType: "HASH" },
            { AttributeName: "sk", KeyType: "RANGE" },
        ],
        BillingMode: "PAY_PER_REQUEST",
    }));
}

// ---------------------------------------------------------------------------
// Dev token parsing
//
// The local server accepts `Authorization: Bearer dev.<sub>.<email?>`.
// This mirrors the production invariant that only authorized callers
// reach the handlers: anything else gets 401 before dispatch.
// ---------------------------------------------------------------------------
interface DevClaims {
    sub: string;
    email: string | null;
}

function parseDevToken(authHeader: string | undefined): DevClaims | null {
    if (!authHeader) return null;
    const m = /^Bearer\s+(.+)$/i.exec(authHeader);
    if (!m) return null;
    const token = m[1].trim();
    if (!token.startsWith("dev.")) return null;
    // dev.<sub>[.<email>]
    const rest = token.slice(4);
    const firstDot = rest.indexOf(".");
    if (firstDot < 0) {
        return rest.length > 0 ? { sub: rest, email: null } : null;
    }
    const sub = rest.slice(0, firstDot);
    const email = rest.slice(firstDot + 1);
    if (!sub) return null;
    return { sub, email: email || null };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
type Handler = (
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
) => Promise<APIGatewayProxyResultV2>;

interface MatchedRoute {
    handler: Handler;
    pathParameters: Record<string, string>;
    requiresDevAuth: boolean;
}

function matchRoute(method: string, pathname: string): MatchedRoute | null {
    if (pathname === "/me" && (method === "GET" || method === "PATCH")) {
        return { handler: profile.handler, pathParameters: {}, requiresDevAuth: true };
    }
    if (pathname === "/me/migrate" && method === "POST") {
        return { handler: state.handler, pathParameters: {}, requiresDevAuth: true };
    }
    if (pathname.startsWith("/me/arctracker/") && method === "GET") {
        return { handler: arctrackerUserProxy.handler, pathParameters: {}, requiresDevAuth: true };
    }
    const stateMatch = /^\/me\/state\/([^/]+)$/.exec(pathname);
    if (stateMatch && (method === "GET" || method === "PUT" || method === "DELETE")) {
        return {
            handler: state.handler,
            pathParameters: { domain: decodeURIComponent(stateMatch[1]) },
            requiresDevAuth: true,
        };
    }
    const linksMatch = /^\/me\/links\/([^/]+)$/.exec(pathname);
    if (linksMatch && (method === "GET" || method === "PUT" || method === "DELETE")) {
        return {
            handler: links.handler,
            pathParameters: { provider: decodeURIComponent(linksMatch[1]) },
            requiresDevAuth: true,
        };
    }
    return null;
}

// ---------------------------------------------------------------------------
// Event construction
// ---------------------------------------------------------------------------

async function readBody(req: IncomingMessage): Promise<string | null> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    if (chunks.length === 0) return null;
    return Buffer.concat(chunks).toString("utf8");
}

function buildEvent(
    req: IncomingMessage,
    url: URL,
    pathParameters: Record<string, string>,
    body: string | null,
    claims: DevClaims,
): APIGatewayProxyEventV2WithJWTAuthorizer {
    const method = (req.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string") headers[k.toLowerCase()] = v;
        else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(",");
    }
    const queryStringParameters: Record<string, string> = {};
    for (const [k, v] of url.searchParams) queryStringParameters[k] = v;

    const claimsRecord: Record<string, string | number | boolean> = { sub: claims.sub };
    if (claims.email) claimsRecord.email = claims.email;

    return {
        version: "2.0",
        routeKey: `${method} ${url.pathname}`,
        rawPath: url.pathname,
        rawQueryString: url.search.replace(/^\?/, ""),
        headers,
        queryStringParameters: Object.keys(queryStringParameters).length > 0 ? queryStringParameters : undefined,
        pathParameters: Object.keys(pathParameters).length > 0 ? pathParameters : undefined,
        body: body ?? undefined,
        isBase64Encoded: false,
        requestContext: {
            accountId: "local",
            apiId: "local",
            domainName: headers.host ?? "localhost",
            domainPrefix: "local",
            http: {
                method,
                path: url.pathname,
                protocol: "HTTP/1.1",
                sourceIp: req.socket.remoteAddress ?? "127.0.0.1",
                userAgent: headers["user-agent"] ?? "",
            },
            requestId: `local-${Date.now()}`,
            routeKey: `${method} ${url.pathname}`,
            stage: "$default",
            time: new Date().toISOString(),
            timeEpoch: Date.now(),
            authorizer: {
                // `principalId` and `integrationLatency` are part of the
                // AWS-provided authorizer typing but the handlers never
                // read them; we fill them with placeholders so the cast
                // is type-safe without loosening the handler contract.
                principalId: claims.sub,
                integrationLatency: 0,
                jwt: {
                    claims: claimsRecord,
                    scopes: [],
                },
            },
        },
    } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

function corsHeaders(origin: string | undefined): Record<string, string> {
    const allowedList = ALLOWED_ORIGINS.split(",").map(o => o.trim()).filter(Boolean);
    const allowOrigin = origin && allowedList.includes(origin)
        ? origin
        : (allowedList[0] ?? "*");
    return {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Vary": "Origin",
    };
}

function writeStructured(
    res: ServerResponse,
    origin: string | undefined,
    status: number,
    body: unknown,
): void {
    res.writeHead(status, {
        "Content-Type": "application/json",
        ...corsHeaders(origin),
    });
    res.end(JSON.stringify(body));
}

function writeLambdaResult(
    res: ServerResponse,
    origin: string | undefined,
    result: APIGatewayProxyResultV2,
): void {
    if (typeof result === "string") {
        res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders(origin) });
        res.end(result);
        return;
    }
    const r = result as APIGatewayProxyStructuredResultV2;
    const headers: Record<string, string> = { ...corsHeaders(origin) };
    for (const [k, v] of Object.entries(r.headers ?? {})) {
        if (v !== undefined && v !== null) headers[k] = String(v);
    }
    res.writeHead(r.statusCode ?? 200, headers);
    res.end(r.body ?? "");
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const origin = req.headers.origin as string | undefined;
    const method = (req.method ?? "GET").toUpperCase();

    if (method === "OPTIONS") {
        res.writeHead(204, corsHeaders(origin));
        res.end();
        return;
    }

    const rawUrl = req.url ?? "/";
    const url = new URL(rawUrl, `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/healthz") {
        writeStructured(res, origin, 200, { ok: true, table: TABLE_NAME, endpoint: DDB_ENDPOINT });
        return;
    }

    const route = matchRoute(method, url.pathname);
    if (!route) {
        writeStructured(res, origin, 404, { error: `No route for ${method} ${url.pathname}` });
        return;
    }

    const claims = route.requiresDevAuth
        ? parseDevToken(req.headers.authorization as string | undefined)
        : { sub: "local-relay", email: null };
    if (!claims) {
        writeStructured(res, origin, 401, { error: "Missing or invalid dev token" });
        return;
    }

    let body: string | null;
    try {
        body = await readBody(req);
    } catch (err) {
        writeStructured(res, origin, 400, { error: `Body read failed: ${(err as Error).message}` });
        return;
    }

    const event = buildEvent(req, url, route.pathParameters, body, claims);
    try {
        const result = await route.handler(event);
        writeLambdaResult(res, origin, result);
    } catch (err) {
        const e = err as Error;
        console.error("[local-api] handler threw", {
            path: url.pathname,
            method,
            message: e.message,
            stack: e.stack,
        });
        writeStructured(res, origin, 500, { error: "Internal error", message: e.message });
    }
}

async function main(): Promise<void> {
    await ensureTable();
    const server = createServer((req, res) => {
        handleRequest(req, res).catch(err => {
            console.error("[local-api] unhandled", err);
            if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Unhandled server error" }));
            }
        });
    });
    server.listen(LOCAL_API_PORT, () => {
        console.log(`[local-api] listening on http://localhost:${LOCAL_API_PORT}`);
        console.log(`[local-api] dynamodb endpoint: ${DDB_ENDPOINT}`);
        console.log(`[local-api] user table:        ${TABLE_NAME}`);
        console.log(`[local-api] allowed origins:   ${ALLOWED_ORIGINS}`);
    });
}

main().catch(err => {
    console.error("[local-api] failed to start", err);
    process.exit(1);
});
