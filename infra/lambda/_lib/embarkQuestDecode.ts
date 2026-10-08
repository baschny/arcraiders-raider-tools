import { gameMappings } from "./gameMappings";

export interface EmbarkRawQuestObjective {
    amount?: number;
    gameAssetId?: number | string;
}

export interface EmbarkRawQuest {
    gameAssetId?: number | string;
    objectives?: EmbarkRawQuestObjective[];
    state?: string;
}

export interface EmbarkRawQuestsResponse {
    quests?: EmbarkRawQuest[];
}

export interface DecodedEmbarkQuestObjective {
    completed: boolean;
    currentAmount: number | null;
    requiredAmount: number | null;
}

export interface DecodedEmbarkQuestEntry {
    state: "completed" | "active" | "locked" | "unknown";
    completed: boolean;
    objectives?: DecodedEmbarkQuestObjective[];
}

export interface DecodedEmbarkQuestSnapshot {
    source: "embark";
    syncedAt: string;
    cachedAt: number;
    schemaVersion: 1;
    rawSnapshotId: string;
    questsById: Record<string, DecodedEmbarkQuestEntry>;
}

interface DecodeArgs {
    syncedAt: string;
    cachedAt: number;
    rawSnapshotId: string;
}

export function decodeEmbarkQuests(
    raw: EmbarkRawQuestsResponse,
    args: DecodeArgs,
): DecodedEmbarkQuestSnapshot {
    const runtimeByQuestAssetId = new Map<string, EmbarkRawQuest>();
    for (const quest of raw.quests ?? []) {
        const assetId = parseNumericPrefix(quest.gameAssetId);
        if (assetId) runtimeByQuestAssetId.set(assetId, quest);
    }

    const questsById: Record<string, DecodedEmbarkQuestEntry> = {};
    for (const [questAssetId, mapping] of Object.entries(gameMappings.quests)) {
        const runtime = runtimeByQuestAssetId.get(questAssetId);
        const state = normalizeQuestState(runtime?.state);
        const objectiveRuntimeById = new Map<string, EmbarkRawQuestObjective>();
        for (const objective of runtime?.objectives ?? []) {
            const objectiveAssetId = parseNumericPrefix(objective.gameAssetId);
            if (objectiveAssetId) {
                objectiveRuntimeById.set(objectiveAssetId, objective);
            }
        }

        // Leaf objectives in tree order (objective keys '0.1', '0.2', ...).
        const objectives = Object.keys(mapping.required)
            .sort((a, b) => compareObjectiveKeys(mapping.objectives[a], mapping.objectives[b]))
            .map((objectiveAssetId) => {
                const runtimeObjective = objectiveRuntimeById.get(objectiveAssetId);
                const currentAmount = typeof runtimeObjective?.amount === "number"
                    ? runtimeObjective.amount
                    : null;
                const requiredAmount: number | null = mapping.required[objectiveAssetId] ?? null;
                return {
                    completed: state === "completed"
                        || (
                            currentAmount !== null
                            && requiredAmount !== null
                            && currentAmount >= requiredAmount
                        ),
                    currentAmount,
                    requiredAmount,
                };
            });

        questsById[mapping.questId] = {
            state,
            completed: state === "completed",
            ...(objectives.length > 0 ? { objectives } : {}),
        };
    }

    return {
        source: "embark",
        syncedAt: args.syncedAt,
        cachedAt: args.cachedAt,
        schemaVersion: 1,
        rawSnapshotId: args.rawSnapshotId,
        questsById,
    };
}

function normalizeQuestState(state: string | undefined): DecodedEmbarkQuestEntry["state"] {
    if (state === "COMPLETED") return "completed";
    if (state === "ACCEPTED") return "active";
    if (state === "AWAITING") return "locked";
    return "unknown";
}

function parseNumericPrefix(value: number | string | undefined): string | null {
    if (value === undefined || value === null) return null;
    const match = /^(\d+)/.exec(String(value));
    return match?.[1] ?? null;
}

function compareObjectiveKeys(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? -1) - (pb[i] ?? -1);
        if (d !== 0) return d;
    }
    return 0;
}
