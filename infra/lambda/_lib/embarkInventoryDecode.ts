/* eslint-disable @typescript-eslint/no-require-imports */
const mapping = require("../data/embark-inventory-mapping.json") as EmbarkInventoryMappingFile;
/* eslint-enable @typescript-eslint/no-require-imports */

export interface EmbarkInventoryMappingFile {
    version: number;
    gameAssetIdToItemId: Record<string, string>;
    gameAssetIdToItemName: Record<string, string>;
    structureNames: Record<string, string>;
    blueprintUnlocksByTokenAssetId: Record<string, {
        targetItemId: string;
        blueprintAssetId?: number;
        name?: string;
    }>;
    hideoutBenchLevelsByGeneratorAssetId: Record<string, {
        moduleId: string;
        currentLevel: number;
        maxLevel: number;
        name?: string;
    }>;
    augmentLoadoutsByAugmentAssetId: Record<string, {
        loadoutFrameAssetId: number;
        backpackSlots: number;
        quickUseSlots: number;
        safePocketSlots: number;
        auxiliarySlots: number;
        name?: string;
    }>;
    constants: Record<string, number>;
}

export interface EmbarkRawInventory {
    items: EmbarkRawInventoryItem[];
}

export interface EmbarkRawInventoryItem {
    amount: number;
    durability: number;
    etag?: string;
    gameAssetId: number;
    instanceId: string;
    maxDurability: number;
    slots: string[] | null;
    updatedAt?: number;
}

interface DecodedSlot {
    itemId: string | null;
    name: string | null;
    quantity: number;
    slotIndex: number;
    durabilityPercent: number;
    attachments?: DecodedSlot[];
}

export interface DecodedEmbarkInventorySnapshot {
    source: "embark";
    syncedAt: string;
    cachedAt: number;
    manifestId: string;
    schemaVersion: 1;
    rawSnapshotId: string;
    stash: {
        items: Array<DecodedSlot & { itemId: string | null; name: string; slotIndex: number }>;
        currencies: { credits: number; cred: number; raiderTokens: number; xp: number };
        slots: { used: number; max: number };
        syncedAt: string;
        cachedAt: number;
    };
    loadout: {
        loadout: {
            augment: DecodedSlot;
            shield: DecodedSlot;
            weapon1: DecodedSlot;
            weapon2: DecodedSlot;
            backpack: DecodedSlot[];
            quickItems: DecodedSlot[];
            safePocket: DecodedSlot[];
            augmentedSlots: DecodedSlot[];
            slotCounts: {
                backpack: number;
                quickItems: number;
                safePocket: number;
                augmentedSlots: number;
            };
        };
        syncedAt: string;
        cachedAt: number;
    };
    hideout: {
        modules: Array<{ moduleId: string; currentLevel: number; maxLevel: number }>;
        syncedAt: string;
        cachedAt: number;
    };
    blueprints: {
        unlockedItemIds: string[];
        blueprintsByTargetItemId: Record<string, {
            id: string;
            name: string;
            category: string;
            rarity: string;
            learned: boolean;
            targetItemId: string;
        }>;
        syncedAt: string;
        cachedAt: number;
    };
    diagnostics: {
        unknownGameAssetIds: number[];
        unknownItemInstances: Array<{
            gameAssetId: number;
            instanceId?: string;
            amount?: number;
            context: "stash" | "loadout" | "blueprint" | "hideout" | "other";
        }>;
        mappingVersion: number;
    };
}

interface DecodeContext {
    byInstanceId: Map<string, EmbarkRawInventoryItem>;
    referencedIds: Set<string>;
    childIdsByInstanceId: Map<string, string[]>;
    diagnostics: DecodedEmbarkInventorySnapshot["diagnostics"];
}

const EMPTY_SLOT: DecodedSlot = {
    itemId: null,
    name: null,
    quantity: 0,
    slotIndex: 0,
    durabilityPercent: 100,
};

type BlueprintDecodeResult = Pick<
    DecodedEmbarkInventorySnapshot["blueprints"],
    "unlockedItemIds" | "blueprintsByTargetItemId"
>;

export function decodeEmbarkInventory(
    raw: EmbarkRawInventory,
    args: { syncedAt: string; cachedAt: number; manifestId: string; rawSnapshotId: string },
): DecodedEmbarkInventorySnapshot {
    const ctx = buildContext(raw);
    const inventoryRoot = raw.items.find(item => item.gameAssetId === mapping.constants.inventoryRootAssetId);

    const stashItems = inventoryRoot ? extractStash(ctx, inventoryRoot) : [];
    const loadout = extractLoadout(ctx, raw.items, inventoryRoot);
    const hideout = extractHideout(raw.items, ctx);
    const blueprints = extractBlueprints(raw.items, ctx);
    const currencies = extractCurrencies(raw.items);

    const maxStashSlots = countRegularSlots(ctx, inventoryRoot, [
        mapping.constants.mainStashRootAssetId,
        mapping.constants.extraStashRootAssetId,
    ]);

    return {
        source: "embark",
        syncedAt: args.syncedAt,
        cachedAt: args.cachedAt,
        manifestId: args.manifestId,
        schemaVersion: 1,
        rawSnapshotId: args.rawSnapshotId,
        stash: {
            items: stashItems,
            currencies,
            slots: {
                used: stashItems.length,
                max: maxStashSlots,
            },
            syncedAt: args.syncedAt,
            cachedAt: args.cachedAt,
        },
        loadout: {
            loadout,
            syncedAt: args.syncedAt,
            cachedAt: args.cachedAt,
        },
        hideout: {
            modules: hideout,
            syncedAt: args.syncedAt,
            cachedAt: args.cachedAt,
        },
        blueprints: {
            unlockedItemIds: blueprints.unlockedItemIds,
            blueprintsByTargetItemId: blueprints.blueprintsByTargetItemId,
            syncedAt: args.syncedAt,
            cachedAt: args.cachedAt,
        },
        diagnostics: ctx.diagnostics,
    };
}

function buildContext(raw: EmbarkRawInventory): DecodeContext {
    const byInstanceId = new Map(raw.items.map(item => [item.instanceId, item]));
    const referencedIds = new Set<string>();
    const childIdsByInstanceId = new Map<string, string[]>();
    for (const item of raw.items) {
        const children = (item.slots ?? []).filter(Boolean);
        childIdsByInstanceId.set(item.instanceId, children);
        for (const child of children) referencedIds.add(child);
    }
    return {
        byInstanceId,
        referencedIds,
        childIdsByInstanceId,
        diagnostics: {
            unknownGameAssetIds: [],
            unknownItemInstances: [],
            mappingVersion: mapping.version,
        },
    };
}

function childrenOf(ctx: DecodeContext, item: EmbarkRawInventoryItem | undefined | null): EmbarkRawInventoryItem[] {
    if (!item) return [];
    return (ctx.childIdsByInstanceId.get(item.instanceId) ?? [])
        .map(id => ctx.byInstanceId.get(id))
        .filter((child): child is EmbarkRawInventoryItem => Boolean(child));
}

function findDescendantByAssetId(
    ctx: DecodeContext,
    item: EmbarkRawInventoryItem | undefined | null,
    assetId: number,
    visited = new Set<string>(),
): EmbarkRawInventoryItem | null {
    if (!item) return null;
    if (visited.has(item.instanceId)) return null;
    visited.add(item.instanceId);
    if (item.gameAssetId === assetId) return item;
    for (const child of childrenOf(ctx, item)) {
        const found = findDescendantByAssetId(ctx, child, assetId, visited);
        if (found) return found;
    }
    return null;
}

function collectDescendants(
    ctx: DecodeContext,
    item: EmbarkRawInventoryItem | undefined | null,
    visited = new Set<string>(),
): EmbarkRawInventoryItem[] {
    if (!item) return [];
    if (visited.has(item.instanceId)) return [];
    visited.add(item.instanceId);
    const result: EmbarkRawInventoryItem[] = [];
    for (const child of childrenOf(ctx, item)) {
        if (visited.has(child.instanceId)) continue;
        result.push(child, ...collectDescendants(ctx, child, visited));
    }
    return result;
}

function extractStash(
    ctx: DecodeContext,
    inventoryRoot: EmbarkRawInventoryItem,
): Array<DecodedSlot & { itemId: string | null; name: string; slotIndex: number }> {
    const roots = [
        findDescendantByAssetId(ctx, inventoryRoot, mapping.constants.mainStashRootAssetId),
        findDescendantByAssetId(ctx, inventoryRoot, mapping.constants.extraStashRootAssetId),
    ];
    const slots = roots.flatMap(root => collectDescendants(ctx, root)
        .filter(item => item.gameAssetId === mapping.constants.regularItemSlotAssetId));

    const rows: Array<DecodedSlot & { itemId: string | null; name: string; slotIndex: number }> = [];
    slots.forEach((slot, slotIndex) => {
        const item = firstActualItem(ctx, slot);
        if (!item) return;
        const decoded = decodeActualItem(ctx, item, slotIndex, "stash");
        if (!decoded.itemId) {
            recordUnknown(ctx, item, "stash");
            return;
        }
        rows.push({
            ...decoded,
            itemId: decoded.itemId,
            name: decoded.name ?? decoded.itemId,
            slotIndex,
        });
    });
    return rows;
}

function firstActualItem(ctx: DecodeContext, slot: EmbarkRawInventoryItem): EmbarkRawInventoryItem | null {
    const direct = childrenOf(ctx, slot);
    if (direct.length === 0) return null;
    return direct.find(child => mapping.gameAssetIdToItemId[String(child.gameAssetId)]) ?? direct[0] ?? null;
}

function decodeActualItem(
    ctx: DecodeContext,
    item: EmbarkRawInventoryItem,
    slotIndex: number,
    context: "stash" | "loadout",
): DecodedSlot {
    const itemId = mapping.gameAssetIdToItemId[String(item.gameAssetId)] ?? null;
    const name = mapping.gameAssetIdToItemName[String(item.gameAssetId)] ?? itemId;
    const attachments = collectAttachments(ctx, item, context);
    return {
        itemId,
        name,
        quantity: Math.max(1, Number(item.amount ?? 1)),
        slotIndex,
        durabilityPercent: durabilityPercent(item),
        attachments: attachments.length > 0 ? attachments : undefined,
    };
}

function collectAttachments(
    ctx: DecodeContext,
    item: EmbarkRawInventoryItem,
    context: "stash" | "loadout",
): DecodedSlot[] {
    const descendants = collectDescendants(ctx, item);
    const attachments: DecodedSlot[] = [];
    let slotIndex = 0;
    for (const descendant of descendants) {
        if (descendant.instanceId === item.instanceId) continue;
        const itemId = mapping.gameAssetIdToItemId[String(descendant.gameAssetId)];
        if (!itemId) continue;
        attachments.push(decodeActualItem(ctx, descendant, slotIndex++, context));
    }
    return attachments;
}

function extractLoadout(
    ctx: DecodeContext,
    allItems: EmbarkRawInventoryItem[],
    inventoryRoot: EmbarkRawInventoryItem | undefined,
): DecodedEmbarkInventorySnapshot["loadout"]["loadout"] {
    const selectedAugment = inventoryRoot
        ? findDescendantByAssetId(ctx, inventoryRoot, mapping.constants.currentAugmentAssetId)
        : null;
    const selectedAugmentItem = selectedAugment
        ? collectDescendants(ctx, selectedAugment).find(item => mapping.augmentLoadoutsByAugmentAssetId[String(item.gameAssetId)])
        : null;
    const augmentMapping = selectedAugmentItem
        ? mapping.augmentLoadoutsByAugmentAssetId[String(selectedAugmentItem.gameAssetId)]
        : null;
    const frame = augmentMapping
        ? allItems.find(item => item.gameAssetId === augmentMapping.loadoutFrameAssetId)
        : null;

    const frameChildren = childrenOf(ctx, frame);
    const mountSlots = frameChildren.map((mount, index) => collectMountSlots(ctx, mount, index));
    const slotAt = (index: number): DecodedSlot[] => mountSlots[index] ?? [];
    const singleAt = (index: number): DecodedSlot => slotAt(index)[0] ?? { ...EMPTY_SLOT, slotIndex: index };

    const augmentSlot = selectedAugmentItem
        ? decodeActualItem(ctx, selectedAugmentItem, 0, "loadout")
        : { ...EMPTY_SLOT };

    const backpack = slotAt(0);
    const weapon1 = singleAt(1);
    const weapon2 = singleAt(2);
    const shield = singleAt(3);
    const quickItems = slotAt(4);
    const maybeMelee = slotAt(5);
    const safePocket = slotAt(6);
    const auxiliary = [
        ...maybeMelee,
        ...slotAt(7),
    ];

    return {
        augment: augmentSlot,
        shield,
        weapon1,
        weapon2,
        backpack,
        quickItems,
        safePocket,
        augmentedSlots: auxiliary,
        slotCounts: {
            backpack: augmentMapping?.backpackSlots ?? backpack.length,
            quickItems: augmentMapping?.quickUseSlots ?? quickItems.length,
            safePocket: augmentMapping?.safePocketSlots ?? safePocket.length,
            augmentedSlots: augmentMapping?.auxiliarySlots ?? auxiliary.length,
        },
    };
}

function collectMountSlots(ctx: DecodeContext, mount: EmbarkRawInventoryItem, mountIndex: number): DecodedSlot[] {
    const leafSlots = collectDescendants(ctx, mount)
        .filter(item => item.slots && item.slots.length > 0)
        .filter(item => childrenOf(ctx, item).some(child => mapping.gameAssetIdToItemId[String(child.gameAssetId)]));
    const decoded: DecodedSlot[] = [];
    leafSlots.forEach((slot, index) => {
        const item = firstActualItem(ctx, slot);
        if (!item) return;
        const value = decodeActualItem(ctx, item, index, "loadout");
        if (!value.itemId) {
            recordUnknown(ctx, item, "loadout");
            return;
        }
        decoded.push(value);
    });
    if (decoded.length === 0) return [];
    return decoded.map((slot, index) => ({ ...slot, slotIndex: index || mountIndex }));
}

function extractHideout(
    allItems: EmbarkRawInventoryItem[],
    ctx: DecodeContext,
): Array<{ moduleId: string; currentLevel: number; maxLevel: number }> {
    const modules = new Map<string, { moduleId: string; currentLevel: number; maxLevel: number }>();
    for (const item of allItems) {
        const mapped = mapping.hideoutBenchLevelsByGeneratorAssetId[String(item.gameAssetId)];
        if (!mapped) continue;
        const existing = modules.get(mapped.moduleId);
        if (!existing || mapped.currentLevel > existing.currentLevel) {
            modules.set(mapped.moduleId, {
                moduleId: mapped.moduleId,
                currentLevel: mapped.currentLevel,
                maxLevel: mapped.maxLevel,
            });
        }
    }
    if (modules.size === 0) {
        for (const item of allItems) {
            if (item.gameAssetId === mapping.constants.workshopRootAssetId) continue;
            if (String(item.gameAssetId) in mapping.structureNames) continue;
            recordUnknown(ctx, item, "hideout");
        }
    }
    return Array.from(modules.values()).sort((a, b) => a.moduleId.localeCompare(b.moduleId));
}

function extractBlueprints(
    allItems: EmbarkRawInventoryItem[],
    ctx: DecodeContext,
): BlueprintDecodeResult {
    const blueprintsByTargetItemId: DecodedEmbarkInventorySnapshot["blueprints"]["blueprintsByTargetItemId"] = {};
    const unlockedItemIds = new Set<string>();
    for (const item of allItems) {
        const mapped = mapping.blueprintUnlocksByTokenAssetId[String(item.gameAssetId)];
        if (!mapped) continue;
        unlockedItemIds.add(mapped.targetItemId);
        blueprintsByTargetItemId[mapped.targetItemId] = {
            id: mapped.targetItemId,
            name: mapped.name ?? mapped.targetItemId,
            category: "Embark",
            rarity: "",
            learned: true,
            targetItemId: mapped.targetItemId,
        };
    }
    for (const item of allItems) {
        const maybeBlueprintName = mapping.gameAssetIdToItemName[String(item.gameAssetId)] ?? "";
        if (maybeBlueprintName.toLowerCase().includes("unlock") && !mapping.blueprintUnlocksByTokenAssetId[String(item.gameAssetId)]) {
            recordUnknown(ctx, item, "blueprint");
        }
    }
    return {
        unlockedItemIds: Array.from(unlockedItemIds).sort((a, b) => a.localeCompare(b)),
        blueprintsByTargetItemId,
    };
}

function extractCurrencies(allItems: EmbarkRawInventoryItem[]): { credits: number; cred: number; raiderTokens: number; xp: number } {
    const currencies = { credits: 0, cred: 0, raiderTokens: 0, xp: 0 };
    for (const item of allItems) {
        const itemId = mapping.gameAssetIdToItemId[String(item.gameAssetId)];
        if (itemId === "coins") currencies.credits = item.amount ?? 0;
        if (itemId === "cred") currencies.cred = item.amount ?? 0;
        if (itemId === "raider_tokens") currencies.raiderTokens = item.amount ?? 0;
        if (itemId === "xp") currencies.xp = item.amount ?? 0;
    }
    return currencies;
}

function countRegularSlots(
    ctx: DecodeContext,
    inventoryRoot: EmbarkRawInventoryItem | undefined,
    rootAssetIds: number[],
): number {
    if (!inventoryRoot) return 0;
    return rootAssetIds
        .map(assetId => findDescendantByAssetId(ctx, inventoryRoot, assetId))
        .flatMap(root => collectDescendants(ctx, root))
        .filter(item => item.gameAssetId === mapping.constants.regularItemSlotAssetId)
        .length;
}

function durabilityPercent(item: EmbarkRawInventoryItem): number {
    if (!item.maxDurability) return 100;
    return Math.max(0, Math.min(100, (item.durability / item.maxDurability) * 100));
}

function recordUnknown(
    ctx: DecodeContext,
    item: EmbarkRawInventoryItem,
    context: "stash" | "loadout" | "blueprint" | "hideout" | "other",
): void {
    if (mapping.gameAssetIdToItemId[String(item.gameAssetId)]) return;
    if (!ctx.diagnostics.unknownGameAssetIds.includes(item.gameAssetId)) {
        ctx.diagnostics.unknownGameAssetIds.push(item.gameAssetId);
    }
    if (!ctx.diagnostics.unknownItemInstances.some(existing => existing.instanceId === item.instanceId && existing.context === context)) {
        ctx.diagnostics.unknownItemInstances.push({
            gameAssetId: item.gameAssetId,
            instanceId: item.instanceId,
            amount: item.amount,
            context,
        });
    }
}
