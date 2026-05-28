import { embarkQuestMapping } from "../data/embarkQuestMapping";

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
    for (const [questAssetId, mapping] of Object.entries(embarkQuestMapping)) {
        const runtime = runtimeByQuestAssetId.get(questAssetId);
        const state = normalizeQuestState(runtime?.state);
        const objectiveRuntimeById = new Map<string, EmbarkRawQuestObjective>();
        for (const objective of runtime?.objectives ?? []) {
            const objectiveAssetId = parseNumericPrefix(objective.gameAssetId);
            if (objectiveAssetId) {
                objectiveRuntimeById.set(objectiveAssetId, objective);
            }
        }

        const objectives = mapping.objectiveDefinitions.map((definition) => {
            const runtimeObjective = objectiveRuntimeById.get(definition.gameAssetId);
            const currentAmount = typeof runtimeObjective?.amount === "number"
                ? runtimeObjective.amount
                : null;
            const requiredAmount = definition.amount;
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

        questsById[mapping.id] = {
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
