import { describe, expect, it } from "vitest";
import { matchLocalRoutePattern } from "../routes";

describe("local server quest routes", () => {
    it("matches the embark quests GET route", () => {
        expect(matchLocalRoutePattern("GET", "/me/embark/quests")).not.toBeNull();
    });

    it("matches the embark quests sync POST route", () => {
        expect(matchLocalRoutePattern("POST", "/me/embark/quests/sync")).not.toBeNull();
    });

    it("matches all Quartermaster tutorial snapshot routes", () => {
        expect(matchLocalRoutePattern("GET", "/me/quartermaster/snapshots")?.key).toBe("quartermasterSnapshots");
        expect(matchLocalRoutePattern("POST", "/me/quartermaster/snapshots")?.key).toBe("quartermasterSnapshots");
        expect(matchLocalRoutePattern("POST", "/me/quartermaster/snapshots/example/restore")?.pathParameters.snapshotId).toBe("example");
        expect(matchLocalRoutePattern("DELETE", "/me/quartermaster/snapshots/example")?.pathParameters.snapshotId).toBe("example");
    });
});
