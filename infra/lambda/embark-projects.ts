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
    getEmbarkRequestConfig,
    buildEmbarkApiHeaders,
    EMBARK_API_BASE_URL,
    type EmbarkTokenPayload,
} from "./_lib/embark";
import { decryptToken, type EnvelopePayload } from "./_lib/envelope";
import {
    hasJwtGroup,
    jsonResponse,
    jwtSub,
    pickAllowedOrigin,
} from "./_lib/http";
import { consumeTokenBucket } from "./_lib/embarkThrottle";
import { gameMappings } from "./_lib/gameMappings";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: {
        removeUndefinedValues: true,
    },
});

const EMBARK_AUTH_GROUP = "embark-auth";
const USER_THROTTLE = {
    capacity: Number(process.env.EMBARK_PROJECTS_USER_BUCKET_CAPACITY ?? 4),
    refillIntervalSeconds: Number(process.env.EMBARK_PROJECTS_USER_REFILL_SECONDS ?? 300),
    refillTokens: 1,
};
const GLOBAL_THROTTLE = {
    capacity: Number(process.env.EMBARK_PROJECTS_GLOBAL_BUCKET_CAPACITY ?? 80),
    refillIntervalSeconds: Number(process.env.EMBARK_PROJECTS_GLOBAL_REFILL_SECONDS ?? 60),
    refillTokens: Number(process.env.EMBARK_PROJECTS_GLOBAL_REFILL_TOKENS ?? 10),
};

interface EmbarkLinkItem extends EnvelopePayload {
    expiresAt?: string | null;
}

interface CachedProjectGoal {
    goalAssetId: number;
    itemId: string;
    required: number;
    submitted: number;
    remaining: number;
    completed: boolean;
}

interface CachedProjectStepProgress {
    name: string;
    index: number;
    completed: boolean;
    goals: CachedProjectGoal[];
}

interface CachedProjectProgress {
    projectId: string;
    projectName: string;
    completed: boolean;
    steps: CachedProjectStepProgress[];
    syncedAt: string;
    cachedAt: number;
}

interface CachedProjects {
    projects: CachedProjectProgress[];
    syncedAt: string;
    cachedAt: number;
}

interface EmbarkGoalResponse {
    amount: number;
    goalAssetId: number;
    goalId: string;
    state: "COMPLETED" | "IN_PROGRESS";
}

interface EmbarkProjectResponse {
    goals: EmbarkGoalResponse[];
    projectAssetId: number;
    projectId: string;
    state: "IN_PROGRESS" | "COMPLETED" | "ABANDONED" | "DEPARTED";
    departureWindowAssetId?: number;
}

interface EmbarkProjectsListResponse {
    projects: EmbarkProjectResponse[];
}

interface LatestProjectsRow {
    pk: string;
    sk: string;
    source: "embark";
    syncedAt: string;
    cachedAt: number;
    schemaVersion: 1;
    manifestId: string;
    projects: CachedProjects;
    updatedAt: string;
}

interface ProjectIndexStep {
    key: string;
    name: string;
    goals: Array<{ goalAssetId: number; key: string; itemId: string; required: number }>;
}

interface ProjectIndexEntry {
    projectId: string;
    projectName: string;
    steps: ProjectIndexStep[];
}

let projectIndex: Map<string, ProjectIndexEntry> | null = null;

/** Groups the flat asset-id table of game-mappings.json by project (key paths 'i.j' / 'i.j.k'). */
function getProjectIndex(): Map<string, ProjectIndexEntry> {
    if (projectIndex) return projectIndex;
    const bySlug = new Map<string, ProjectIndexEntry>();
    const byAssetId = new Map<string, ProjectIndexEntry>();
    const entries = Object.entries(gameMappings.projects);
    for (const [assetId, entry] of entries) {
        if (entry.key !== undefined) continue;
        const project = { projectId: entry.projectId, projectName: entry.name ?? entry.projectId, steps: [] };
        bySlug.set(entry.projectId, project);
        byAssetId.set(assetId, project);
    }
    const steps = new Map<string, ProjectIndexStep>();
    for (const [, entry] of entries) {
        if (entry.key === undefined || entry.key.split(".").length !== 2) continue;
        const step = { key: entry.key, name: entry.name ?? entry.key, goals: [] };
        steps.set(`${entry.projectId}/${entry.key}`, step);
        bySlug.get(entry.projectId)?.steps.push(step);
    }
    for (const [assetId, entry] of entries) {
        if (entry.key === undefined || entry.key.split(".").length !== 3 || !entry.itemId) continue;
        const stepKey = entry.key.split(".").slice(0, 2).join(".");
        steps.get(`${entry.projectId}/${stepKey}`)?.goals.push({
            goalAssetId: Number(assetId),
            key: entry.key,
            itemId: entry.itemId,
            required: entry.required ?? 0,
        });
    }
    for (const project of bySlug.values()) {
        project.steps.sort((a, b) => compareKeys(a.key, b.key));
        for (const step of project.steps) step.goals.sort((a, b) => compareKeys(a.key, b.key));
    }
    projectIndex = byAssetId;
    return projectIndex;
}

function compareKeys(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? -1) - (pb[i] ?? -1);
        if (d !== 0) return d;
    }
    return 0;
}

function decodeProjects(
    raw: EmbarkProjectsListResponse,
    syncedAt: string,
    cachedAt: number,
): CachedProjects {
    const index = getProjectIndex();

    const projects: CachedProjectProgress[] = [];

    for (const rawProj of raw.projects) {
        const projectAssetId = String(rawProj.projectAssetId);
        const mappingEntry = index.get(projectAssetId);
        if (!mappingEntry) {
            console.warn(`No project mapping for projectAssetId ${projectAssetId}`);
            continue;
        }

        const steps: CachedProjectStepProgress[] = [];
        let allStepsComplete = true;

        mappingEntry.steps.forEach((stepMapping, i) => {
            const stepGoals: CachedProjectGoal[] = [];
            let stepComplete = true;

            for (const goalMapping of stepMapping.goals) {
                const rawGoal = rawProj.goals.find((g) => g.goalAssetId === goalMapping.goalAssetId);

                const required = goalMapping.required;
                const submitted = rawGoal ? rawGoal.amount : 0;
                const completed = rawGoal ? rawGoal.state === "COMPLETED" : false;

                if (!completed) stepComplete = false;

                stepGoals.push({
                    goalAssetId: goalMapping.goalAssetId,
                    itemId: goalMapping.itemId,
                    required,
                    submitted,
                    remaining: Math.max(0, required - submitted),
                    completed,
                });
            }

            if (!stepComplete) allStepsComplete = false;

            steps.push({
                name: stepMapping.name,
                index: i + 1,
                completed: stepComplete,
                goals: stepGoals,
            });
        });

        projects.push({
            projectId: mappingEntry.projectId,
            projectName: mappingEntry.projectName,
            completed: allStepsComplete,
            steps,
            syncedAt,
            cachedAt,
        });
    }

    return {
        projects,
        syncedAt,
        cachedAt,
    };
}

async function fetchEmbarkProjects(accessToken: string, manifestId: string, userAgent: string): Promise<EmbarkProjectsListResponse> {
    const config = { manifestId, userAgent };
    const resp = await fetch(`${EMBARK_API_BASE_URL}/v1/pioneer/projects/list`, {
        method: "POST",
        headers: buildEmbarkApiHeaders(accessToken, config),
        body: JSON.stringify({
            states: ["IN_PROGRESS", "COMPLETED", "ABANDONED", "DEPARTED"],
        }),
    });
    if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        console.warn("Embark projects request failed", {
            status: resp.status,
            statusText: resp.statusText,
            body,
        });
        throw new Error(`Embark projects request failed with HTTP ${resp.status}`);
    }
    return resp.json() as Promise<EmbarkProjectsListResponse>;
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
        const e = err as Error & { status?: number; code?: string };
        console.error("EmbarkProjectsFn error", {
            message: e.message,
            name: e.name,
            status: e.status,
            code: e.code,
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
    return jsonResponse(200, row.projects, origin);
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
        sk: "THROTTLE#embark#projects",
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
        sk: "THROTTLE#projects",
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
    const raw = await fetchEmbarkProjects(token.access_token, config.manifestId, config.userAgent);

    const syncedAt = new Date().toISOString();
    const cachedAt = Date.now();
    const projects = decodeProjects(raw, syncedAt, cachedAt);

    const item: LatestProjectsRow = {
        pk: `USER#${sub}`,
        sk: "EMBARK#PROJECTS#LATEST",
        source: "embark",
        syncedAt,
        cachedAt,
        schemaVersion: 1,
        manifestId: config.manifestId,
        projects,
        updatedAt: syncedAt,
    };

    await ddb.send(new PutCommand({
        TableName: tableName,
        Item: item,
    }));

    return jsonResponse(200, projects, origin);
}

async function loadEmbarkLink(tableName: string, sub: string): Promise<EmbarkLinkItem | null> {
    const resp = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { pk: `USER#${sub}`, sk: "LINK#embark" },
    }));
    return (resp.Item as EmbarkLinkItem | undefined) ?? null;
}

async function getLatestRow(tableName: string, sub: string): Promise<LatestProjectsRow | null> {
    const resp = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { pk: `USER#${sub}`, sk: "EMBARK#PROJECTS#LATEST" },
    }));
    return (resp.Item as LatestProjectsRow | undefined) ?? null;
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
