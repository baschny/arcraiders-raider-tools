/**
 * Shared HTTP / utility helpers used by the auth-stack Lambdas.
 *
 * Kept intentionally small and dependency-light so each Lambda bundles
 * cleanly via NodejsFunction without dragging in extra packages.
 */

import type {
    APIGatewayProxyEventV2,
    APIGatewayProxyEventV2WithJWTAuthorizer,
    APIGatewayProxyResultV2,
} from "aws-lambda";

/**
 * Resolve which Origin to allow on the response, based on the
 * `ALLOWED_ORIGINS` env var (comma-separated). Falls back to the first
 * allowed origin when the request did not match any.
 */
export function pickAllowedOrigin(event: APIGatewayProxyEventV2): string {
    const list = (process.env.ALLOWED_ORIGINS ?? "").split(",").map(o => o.trim()).filter(Boolean);
    if (list.length === 0) return "*";
    const requestOrigin = event.headers?.origin || event.headers?.Origin || "";
    return list.includes(requestOrigin) ? requestOrigin : list[0];
}

export function corsHeaders(origin: string): Record<string, string> {
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin",
    };
}

export function jsonResponse(
    statusCode: number,
    body: unknown,
    origin: string,
    extraHeaders: Record<string, string> = {},
): APIGatewayProxyResultV2 {
    return {
        statusCode,
        headers: {
            ...corsHeaders(origin),
            "Content-Type": "application/json",
            ...extraHeaders,
        },
        body: JSON.stringify(body),
    };
}

/**
 * Pull the validated `sub` claim from the HTTP API JWT authorizer context.
 * Returns null if the claim is missing (which should not happen behind the
 * authorizer, but we still guard).
 */
export function jwtSub(event: APIGatewayProxyEventV2WithJWTAuthorizer): string | null {
    const claims = event.requestContext.authorizer?.jwt?.claims as
        | Record<string, string | number | boolean>
        | undefined;
    const sub = claims?.sub;
    return typeof sub === "string" ? sub : null;
}

/**
 * Pull the validated `email` claim from the HTTP API JWT authorizer context.
 */
export function jwtEmail(event: APIGatewayProxyEventV2WithJWTAuthorizer): string | null {
    const claims = event.requestContext.authorizer?.jwt?.claims as
        | Record<string, string | number | boolean>
        | undefined;
    const email = claims?.email;
    return typeof email === "string" ? email : null;
}

export function jwtGroups(event: APIGatewayProxyEventV2WithJWTAuthorizer): string[] {
    const claims = event.requestContext.authorizer?.jwt?.claims as
        | Record<string, string | number | boolean | string[]>
        | undefined;
    const groups = claims?.["cognito:groups"];
    if (Array.isArray(groups)) return groups.filter((group): group is string => typeof group === "string");
    if (typeof groups === "string") {
        const trimmed = groups.trim();
        if (trimmed.startsWith("[")) {
            try {
                const parsed = JSON.parse(trimmed) as unknown;
                if (Array.isArray(parsed)) {
                    return parsed.filter((group): group is string => typeof group === "string");
                }
            } catch {
                // Some integrations surface groups as bracketed plain text
                // like `[embark-auth]` instead of JSON.
                const unwrapped = trimmed.slice(1, trimmed.endsWith("]") ? -1 : undefined);
                return unwrapped
                    .split(",")
                    .map(group => group.trim().replace(/^['"]|['"]$/g, ""))
                    .filter(Boolean);
            }
        }
        return trimmed
            .split(",")
            .map(group => group.trim())
            .filter(Boolean);
    }
    return [];
}

export function hasJwtGroup(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
    group: string,
): boolean {
    if (
        process.env.RAIDER_TOOLS_LOCAL_DEV === "true"
        && process.env.LOCAL_COGNITO_GROUPS === undefined
    ) {
        return true;
    }
    return jwtGroups(event).includes(group);
}

/**
 * Safely parse a JSON body string, returning null on any failure.
 */
export function parseJsonBody<T = unknown>(body: string | undefined | null): T | null {
    if (!body) return null;
    try {
        return JSON.parse(body) as T;
    } catch {
        return null;
    }
}
