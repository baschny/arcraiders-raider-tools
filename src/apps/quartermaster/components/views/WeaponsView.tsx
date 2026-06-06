import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Lock,
  Package,
  Pencil,
  Search,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import type { WeaponBuild } from '../../../../shared/state/stores';
import { useLocale } from '../../../../shared/context/LocaleContext';
import type { ItemsMap, PlannerItem } from '../../types/item';
import type { OwnedItemDisplayRow, PlannerResult } from '../../types/planner';
import { ItemIcon } from '../ItemIcon';
import {
  flattenOwnedModInstances,
  getCraftStatus,
  getSlotIcon,
  getSlotLabelKey,
  getWeaponSlotDefinitions,
  getWeaponTypeSortIndex,
  hasEmptyWeaponSlot,
  matchWeaponSlots,
  WEAPON_SLOT_ORDER,
  type ModCompatibilityMap,
  type OwnedModInstance,
  type OwnedWeaponInstance,
  type WeaponSlotType,
} from '../../utils/weaponMods';
import { getLocalizedQuartermasterType } from '../../utils/localization';
import type { ItemInsightsMap } from '../../utils/itemInsights';

interface WeaponsViewProps {
  itemsMap: ItemsMap;
  ownedItemRows: OwnedItemDisplayRow[];
  ownedWeaponInstances: OwnedWeaponInstance[];
  modCompatibilityMap: ModCompatibilityMap;
  plannerResult: PlannerResult;
  itemInsights: ItemInsightsMap;
  weaponBuilds: WeaponBuild[];
  onWeaponBuildsChange: (weaponBuilds: WeaponBuild[]) => void;
  hasInventoryCache: boolean;
  hasLoadoutCache: boolean;
}

interface BuildMatch {
  build: WeaponBuild;
  matched: number;
  total: number;
  complete: boolean;
}

const RARITY_SORT_ORDER = new Map([
  ['Legendary', 0],
  ['Epic', 1],
  ['Rare', 2],
  ['Uncommon', 3],
  ['Common', 4],
]);

function getDurabilityTone(percent: number): 'low' | 'medium' | 'high' {
  if (percent < 30) return 'low';
  if (percent <= 70) return 'medium';
  return 'high';
}

function getBuildMatches(weapon: PlannerItem, instance: OwnedWeaponInstance, weaponBuilds: WeaponBuild[]): BuildMatch[] {
  const matchingBuilds = weaponBuilds.filter((build) => build.weaponItemId === weapon.id);
  if (matchingBuilds.length === 0) return [];

  const slotMatch = matchWeaponSlots(weapon, instance);
  const attachedModIds = new Set(slotMatch.slots.map((slot) => slot.attachedModId).filter((id): id is string => !!id));

  return matchingBuilds
    .map((build) => {
      const preferredModIds = Object.values(build.slots).filter((modId): modId is string => !!modId);
      const matched = preferredModIds.filter((modId) => attachedModIds.has(modId)).length;
      return {
        build,
        matched,
        total: preferredModIds.length,
        complete: preferredModIds.length > 0 && matched === preferredModIds.length,
      };
    })
    .sort((a, b) => {
      const percentA = a.total > 0 ? a.matched / a.total : 0;
      const percentB = b.total > 0 ? b.matched / b.total : 0;
      if (percentA !== percentB) return percentB - percentA;
      return a.build.name.localeCompare(b.build.name);
    });
}

function createBuildId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `build_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function SlotIcon({
  slotKey,
  compatibleModIds,
  label,
  className = '',
}: {
  slotKey: WeaponSlotType;
  compatibleModIds: string[];
  label: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <span className={`weapons-view__slot-icon-fallback ${className}`}>{label}</span>;
  }

  return (
    <img
      className={`weapons-view__slot-icon ${className}`}
      src={`/images/weapon-mods/${getSlotIcon(slotKey, compatibleModIds)}`}
      alt={label}
      onError={() => setFailed(true)}
    />
  );
}

interface CompatibleModsOverlayProps {
  compatibleModIds: string[];
  preferredModId: string | null;
  attachedModId: string | null;
  itemsMap: ItemsMap;
  ownedModsByItemId: Map<string, OwnedModInstance[]>;
  plannerResult: PlannerResult;
  compareText: (left: string, right: string) => number;
  t: (key: string) => string;
}

function CompatibleModsOverlay({
  compatibleModIds,
  preferredModId,
  attachedModId,
  itemsMap,
  ownedModsByItemId,
  plannerResult,
  compareText,
  t,
}: CompatibleModsOverlayProps) {
  const compatibleMods = compatibleModIds
    .map((modId) => itemsMap[modId])
    .filter((mod): mod is PlannerItem => !!mod)
    .sort((left, right) => compareText(left.name, right.name));

  if (compatibleMods.length === 0) return null;

  return (
    <div className="weapons-view__slot-overlay" role="tooltip">
      <div className="weapons-view__slot-overlay-title">{t('quartermaster.weapons.slot.compatibleTitle')}</div>
      <table className="weapons-view__slot-overlay-table">
        <thead>
          <tr>
            <th>{t('quartermaster.weapons.slot.mod')}</th>
            <th>{t('quartermaster.weapons.slot.craftable')}</th>
            <th>{t('quartermaster.weapons.slot.attachedCount')}</th>
            <th>{t('quartermaster.weapons.slot.availableCount')}</th>
          </tr>
        </thead>
        <tbody>
          {compatibleMods.map((mod) => {
            const ownedInstances = ownedModsByItemId.get(mod.id) ?? [];
            const attachedCount = ownedInstances.filter((instance) => instance.attached).length;
            const availableCount = ownedInstances.length - attachedCount;
            const craftStatus = getCraftStatus(plannerResult.craftability[mod.id]);
            const isPreferred = preferredModId === mod.id;
            const isCorrect = isPreferred && attachedModId === mod.id;
            const rowClass = isCorrect
              ? 'weapons-view__slot-overlay-row--correct'
              : isPreferred
                ? 'weapons-view__slot-overlay-row--needed'
                : '';

            return (
              <tr key={mod.id} className={rowClass}>
                <td>{mod.name}</td>
                <td className={`weapons-view__slot-count ${craftStatus === 'craftable' ? 'weapons-view__slot-count--available' : craftStatus === 'uncraftable' ? 'weapons-view__slot-count--attached' : ''}`}>
                  {craftStatus === 'craftable' && <CheckCircle2 size={12} aria-hidden="true" />}
                  {craftStatus === 'uncraftable' && <Lock size={12} aria-hidden="true" />}
                </td>
                <td className="weapons-view__slot-count weapons-view__slot-count--attached">
                  {attachedCount > 0 && (
                    <>
                      <Lock size={12} aria-hidden="true" />
                      {attachedCount}
                    </>
                  )}
                </td>
                <td className="weapons-view__slot-count weapons-view__slot-count--available">
                  {availableCount > 0 && (
                    <>
                      <Unlock size={12} aria-hidden="true" />
                      {availableCount}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function WeaponsView({
  itemsMap,
  ownedItemRows,
  ownedWeaponInstances,
  modCompatibilityMap,
  plannerResult,
  itemInsights,
  weaponBuilds,
  onWeaponBuildsChange,
  hasInventoryCache,
  hasLoadoutCache,
}: WeaponsViewProps) {
  const { t, tm, compareText } = useLocale();
  const [weaponSearch, setWeaponSearch] = useState('');
  const [weaponTypeFilter, setWeaponTypeFilter] = useState('all');
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);
  const [buildWeaponId, setBuildWeaponId] = useState<string | null>(null);
  const [buildName, setBuildName] = useState('');
  const [buildSlots, setBuildSlots] = useState<Record<string, string | null>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const tooltipContext = useMemo(() => ({
    itemsMap,
    plannerResult,
    itemInsights,
  }), [itemInsights, itemsMap, plannerResult]);

  const weaponTypes = useMemo(() => {
    const types = new Set<string>();
    for (const instance of ownedWeaponInstances) {
      const type = itemsMap[instance.itemId]?.subCategory;
      if (type) types.add(type);
    }
    return Array.from(types).sort((left, right) => {
      const leftIndex = getWeaponTypeSortIndex(left);
      const rightIndex = getWeaponTypeSortIndex(right);
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      return compareText(getLocalizedQuartermasterType(t, left), getLocalizedQuartermasterType(t, right));
    });
  }, [compareText, itemsMap, ownedWeaponInstances, t]);

  const filteredWeapons = useMemo(() => {
    const search = weaponSearch.trim().toLowerCase();
    return ownedWeaponInstances
      .filter((instance) => {
        const weapon = itemsMap[instance.itemId];
        if (!weapon) return false;
        if (search) {
          const nameMatch = weapon.name.toLowerCase().includes(search);
          const modMatch = instance.attachments.some((att) => {
            const mod = itemsMap[att.itemId];
            return mod && mod.name.toLowerCase().includes(search);
          });
          const slotTypeMatch = getWeaponSlotDefinitions(weapon).some((slot) =>
            t(getSlotLabelKey(slot.slotKey)).toLowerCase().includes(search),
          );
          if (!nameMatch && !modMatch && !slotTypeMatch) return false;
        }
        if (weaponTypeFilter !== 'all' && weapon.subCategory !== weaponTypeFilter) return false;
        if (showIncompleteOnly && !hasEmptyWeaponSlot(weapon, instance)) return false;
        return true;
      })
      .sort((left, right) => {
        const leftItem = itemsMap[left.itemId];
        const rightItem = itemsMap[right.itemId];
        const rarityCompare = (RARITY_SORT_ORDER.get(leftItem?.rarity ?? '') ?? 99) - (RARITY_SORT_ORDER.get(rightItem?.rarity ?? '') ?? 99);
        if (rarityCompare !== 0) return rarityCompare;
        const nameCompare = compareText(leftItem?.name ?? '', rightItem?.name ?? '');
        if (nameCompare !== 0) return nameCompare;
        const durabilityCompare = (right.durabilityPercent ?? 100) - (left.durabilityPercent ?? 100);
        if (durabilityCompare !== 0) return durabilityCompare;
        return left.instanceId.localeCompare(right.instanceId);
      });
  }, [compareText, itemsMap, ownedWeaponInstances, showIncompleteOnly, t, weaponSearch, weaponTypeFilter]);

  const ownedModInstances = useMemo(
    () => flattenOwnedModInstances(ownedItemRows, itemsMap),
    [itemsMap, ownedItemRows],
  );

  const ownedModsByItemId = useMemo(() => {
    const map = new Map<string, OwnedModInstance[]>();
    for (const instance of ownedModInstances) {
      const existing = map.get(instance.itemId) ?? [];
      existing.push(instance);
      map.set(instance.itemId, existing);
    }
    return map;
  }, [ownedModInstances]);

  const unattachedModsBySlot = useMemo(() => {
    const search = weaponSearch.trim().toLowerCase();
    const groups = new Map<WeaponSlotType, OwnedModInstance[]>();

    for (const instance of ownedModInstances) {
      if (instance.attached) continue;
      const modItem = itemsMap[instance.itemId];
      if (!modItem) continue;

      const compatEntries = modCompatibilityMap[instance.itemId] ?? [];
      for (const entry of compatEntries) {
        const modNameMatch = modItem.name.toLowerCase().includes(search);
        const slotTypeMatch = t(getSlotLabelKey(entry.slotType)).toLowerCase().includes(search);
        if (search && !modNameMatch && !slotTypeMatch) continue;

        const existing = groups.get(entry.slotType) ?? [];
        if (!existing.some((e) => e.instanceId === instance.instanceId)) {
          existing.push(instance);
        }
        groups.set(entry.slotType, existing);
      }
    }

    for (const slotType of WEAPON_SLOT_ORDER) {
      if (!groups.has(slotType)) groups.set(slotType, []);
    }

    return groups;
  }, [itemsMap, modCompatibilityMap, ownedModInstances, t, weaponSearch]);

  const hasVisibleUnattachedMods = useMemo(
    () => WEAPON_SLOT_ORDER.some((slotType) => (unattachedModsBySlot.get(slotType)?.length ?? 0) > 0),
    [unattachedModsBySlot],
  );

  const buildWeapon = buildWeaponId ? itemsMap[buildWeaponId] : null;
  const existingBuild = buildWeaponId ? weaponBuilds.find((build) => build.weaponItemId === buildWeaponId) : undefined;

  const openBuildModal = (weaponId: string, sourceInstance?: OwnedWeaponInstance) => {
    const weapon = itemsMap[weaponId];
    if (!weapon) return;
    const build = weaponBuilds.find((candidate) => candidate.weaponItemId === weaponId);
    const sourceSlotMatch = sourceInstance ? matchWeaponSlots(weapon, sourceInstance) : null;
    const nextSlots: Record<string, string | null> = {};
    for (const slot of getWeaponSlotDefinitions(weapon)) {
      const attachedModId = sourceSlotMatch?.slots.find((matchedSlot) => matchedSlot.slotKey === slot.slotKey)?.attachedModId ?? null;
      nextSlots[slot.slotKey] = build?.slots[slot.slotKey] ?? attachedModId;
    }
    setBuildWeaponId(weaponId);
    setBuildName(build?.name ?? '');
    setBuildSlots(nextSlots);
  };

  const closeBuildModal = () => {
    setBuildWeaponId(null);
    setBuildName('');
    setBuildSlots({});
  };

  const saveBuild = () => {
    if (!buildWeapon) return;
    const now = new Date().toISOString();
    const trimmedName = buildName.trim();
    const nextBuild: WeaponBuild = {
      id: existingBuild?.id ?? createBuildId(),
      name: trimmedName || tm('quartermaster.weapons.build.autoName', { weapon: buildWeapon.name }),
      weaponItemId: buildWeapon.id,
      slots: buildSlots,
      createdAt: existingBuild?.createdAt ?? now,
      updatedAt: now,
    };
    const withoutExisting = weaponBuilds.filter((build) => build.weaponItemId !== buildWeapon.id);
    onWeaponBuildsChange([...withoutExisting, nextBuild]);
    closeBuildModal();
  };

  const deleteBuild = () => {
    if (!existingBuild || !window.confirm(t('quartermaster.weapons.build.deleteConfirm'))) return;
    onWeaponBuildsChange(weaponBuilds.filter((build) => build.id !== existingBuild.id));
    closeBuildModal();
  };

  const scrollToBuildWeapon = (build: WeaponBuild) => {
    const visibleInstance = filteredWeapons.find((instance) => instance.itemId === build.weaponItemId);
    if (!visibleInstance) {
      setSummaryMessage(t('quartermaster.weapons.build.filteredOut'));
      return;
    }
    setSummaryMessage(null);
    cardRefs.current[visibleInstance.instanceId]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const emptyMessage = ownedWeaponInstances.length === 0
    ? (hasInventoryCache && hasLoadoutCache ? t('quartermaster.weapons.emptySynced') : t('quartermaster.weapons.empty'))
    : t('quartermaster.weapons.noMatch');

  useEffect(() => {
    if (!buildWeaponId) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeBuildModal();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [buildWeaponId]);

  return (
    <div className="weapons-view">
      <div className="weapons-view__filters">
        <div className="weapons-view__search">
          <Search size={14} aria-hidden="true" />
          <input
            type="text"
            className="qm-input"
            placeholder={t('quartermaster.weapons.filter.searchPlaceholder')}
            value={weaponSearch}
            onChange={(event) => setWeaponSearch(event.target.value)}
          />
        </div>
        <select
          className="qm-input weapons-view__filter"
          value={weaponTypeFilter}
          onChange={(event) => setWeaponTypeFilter(event.target.value)}
        >
          <option value="all">{t('quartermaster.weapons.filter.allTypes')}</option>
          {weaponTypes.map((type) => (
            <option key={type} value={type}>
              {getLocalizedQuartermasterType(t, type)}
            </option>
          ))}
        </select>
        <label className="weapons-view__checkbox">
          <input
            type="checkbox"
            checked={showIncompleteOnly}
            onChange={(event) => setShowIncompleteOnly(event.target.checked)}
          />
          {t('quartermaster.weapons.filter.showIncompleteOnly')}
        </label>
      </div>

      {weaponBuilds.length > 0 && (
        <section className="weapons-view__summary">
          <button
            type="button"
            className="weapons-view__summary-header"
            onClick={() => setSummaryOpen((open) => !open)}
            aria-expanded={summaryOpen}
          >
            {summaryOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {t('quartermaster.weapons.build.summaryTitle')}
          </button>
          {summaryOpen && (
            <div className="weapons-view__summary-body">
              {summaryMessage && (
                <div className="weapons-view__summary-message">{summaryMessage}</div>
              )}
              {weaponBuilds.map((build) => {
                const weapon = itemsMap[build.weaponItemId];
                const matchingInstances = ownedWeaponInstances.filter((instance) => instance.itemId === build.weaponItemId);
                const bestMatch = matchingInstances
                  .map((instance) => weapon ? getBuildMatches(weapon, instance, [build])[0] : null)
                  .filter((match): match is BuildMatch => !!match)
                  .sort((left, right) => {
                    const rightPercent = right.total > 0 ? right.matched / right.total : 0;
                    const leftPercent = left.total > 0 ? left.matched / left.total : 0;
                    return rightPercent - leftPercent;
                  })[0];
                const statusClass = !bestMatch || bestMatch.total === 0 ? 'none' : bestMatch.complete ? 'complete' : 'partial';
                const statusLabel = !bestMatch
                  ? t('quartermaster.weapons.build.matchNone')
                    : bestMatch.complete
                      ? tm('quartermaster.weapons.build.matchFull', { weapon: weapon?.name ?? build.weaponItemId })
                      : bestMatch.total === 0
                        ? tm('quartermaster.weapons.build.matchEmpty', { weapon: weapon?.name ?? build.weaponItemId })
                    : tm('quartermaster.weapons.build.matchPartial', {
                        matched: bestMatch.matched,
                        total: bestMatch.total,
                        weapon: weapon?.name ?? build.weaponItemId,
                      });

                return (
                  <div key={build.id} className={`weapons-view__summary-item weapons-view__summary-item--${statusClass}`}>
                    <button
                      type="button"
                      className="weapons-view__summary-link"
                      onClick={() => scrollToBuildWeapon(build)}
                    >
                      <span>{build.name}</span>
                      <small>{weapon?.name ?? build.weaponItemId}</small>
                    </button>
                    <span className="weapons-view__summary-status">{statusLabel}</span>
                    <button
                      type="button"
                      className="qm-button qm-button--icon"
                      onClick={() => openBuildModal(build.weaponItemId)}
                      aria-label={t('quartermaster.lists.editTitleTooltip')}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="qm-button qm-button--icon qm-button--danger"
                      onClick={() => {
                        if (window.confirm(t('quartermaster.weapons.build.deleteConfirm'))) {
                          onWeaponBuildsChange(weaponBuilds.filter((candidate) => candidate.id !== build.id));
                        }
                      }}
                      aria-label={t('quartermaster.weapons.build.delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {filteredWeapons.length === 0 && !hasVisibleUnattachedMods ? (
        <div className="qm-empty-state">
          <Package size={28} />
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <div className="weapons-view__cards">
          {filteredWeapons.map((instance) => {
            const weapon = itemsMap[instance.itemId];
            if (!weapon) return null;
            const slotMatch = matchWeaponSlots(weapon, instance);
            const preferredBuild = weaponBuilds.find((build) => build.weaponItemId === weapon.id);
            const buildMatches = getBuildMatches(weapon, instance, weaponBuilds).filter((match) => match.total > 0);
            const hasFullMatch = buildMatches.some((match) => match.complete);
            const hasPartialMatch = buildMatches.some((match) => match.matched > 0);
            const cardClass = [
              'weapons-view__card',
              hasFullMatch ? 'weapons-view__card--match-full' : '',
              !hasFullMatch && hasPartialMatch ? 'weapons-view__card--match-partial' : '',
            ].filter(Boolean).join(' ');

            return (
              <div
                key={instance.instanceId}
                ref={(element) => {
                  cardRefs.current[instance.instanceId] = element;
                }}
                className={cardClass}
                role="button"
                tabIndex={0}
                onClick={() => openBuildModal(weapon.id, instance)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openBuildModal(weapon.id, instance);
                  }
                }}
              >
                <div className="weapons-view__card-main">
                  <div className="weapons-view__card-icon">
                    <ItemIcon
                      itemId={weapon.id}
                      name={weapon.name}
                      icon={weapon.icon}
                      rarity={weapon.rarity}
                      quantity={1}
                      size="sm"
                      showQuantity={false}
                      showName={false}
                      tooltipContext={tooltipContext}
                    />
                  </div>
                  <div className="weapons-view__card-info">
                    <div className="weapons-view__card-title-row">
                      <h3 className="qm-item-name">{weapon.name}</h3>
                      {instance.source === 'loadout' && (
                        <span className="weapons-view__source">{t(instance.sourceLabelKey)}</span>
                      )}
                    </div>
                    {instance.durabilityPercent !== undefined && (
                      <div className="weapons-view__durability">
                        <div className="weapons-view__durability-bar-wrapper">
                          <div
                            className={`weapons-view__durability-bar weapons-view__durability-bar--${getDurabilityTone(instance.durabilityPercent)}`}
                            style={{ width: `${Math.min(100, Math.max(0, instance.durabilityPercent))}%` }}
                          />
                        </div>
                        <span className="weapons-view__durability-label">
                          {instance.durabilityPercent.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="weapons-view__card-slots">
                  {slotMatch.slots.map((slot) => {
                    const attachedMod = slot.attachedModId ? itemsMap[slot.attachedModId] : null;
                    return (
                      <div
                        key={slot.slotKey}
                        className="weapons-view__card-slot"
                      >
                        <div className="weapons-view__slot-type-row">
                          <SlotIcon
                            slotKey={slot.slotKey}
                            compatibleModIds={slot.compatibleModIds}
                            label={t(getSlotLabelKey(slot.slotKey))}
                            className="weapons-view__slot-type-icon"
                          />
                          <span className="weapons-view__slot-type-label">
                            {t(getSlotLabelKey(slot.slotKey))}
                          </span>
                        </div>
                        {attachedMod ? (
                          <>
                            <ItemIcon
                              itemId={attachedMod.id}
                              name={attachedMod.name}
                              icon={attachedMod.icon}
                              rarity={attachedMod.rarity}
                              quantity={1}
                              size="xs"
                              showName={false}
                              showQuantity={false}
                              tooltipContext={tooltipContext}
                            />
                            <div className="weapons-view__card-slot-names">{attachedMod.name}</div>
                          </>
                        ) : (
                          <div className="weapons-view__empty-slot" aria-label={t('quartermaster.weapons.slot.empty')}>
                            <Package size={28} aria-hidden="true" />
                          </div>
                        )}
                        <CompatibleModsOverlay
                          compatibleModIds={slot.compatibleModIds}
                          preferredModId={preferredBuild?.slots[slot.slotKey] ?? null}
                          attachedModId={slot.attachedModId}
                          itemsMap={itemsMap}
                          ownedModsByItemId={ownedModsByItemId}
                          plannerResult={plannerResult}
                          compareText={compareText}
                          t={t}
                        />
                      </div>
                    );
                  })}
                </div>

                {slotMatch.unmatchedAttachments.length > 0 && (
                  <div className="weapons-view__unmatched">
                    <AlertTriangle size={14} />
                    <span>{t('quartermaster.weapons.slot.unmatchedAttachments')}</span>
                    {slotMatch.unmatchedAttachments.map((attachment) => itemsMap[attachment.itemId]?.name).filter(Boolean).join(', ')}
                  </div>
                )}

                {buildMatches.length > 0 && (
                  <div className="weapons-view__build-badges">
                    {buildMatches.map((match) => (
                      <span
                        key={match.build.id}
                        className={`weapons-view__card-build-badge ${match.complete ? 'weapons-view__card-build-badge--full' : ''}`}
                      >
                        {match.total > 0 ? `${match.build.name}: ${match.matched}/${match.total}` : match.build.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {WEAPON_SLOT_ORDER.map((slotType) => {
        const unattached = unattachedModsBySlot.get(slotType) ?? [];
        if (unattached.length === 0) return null;

        return (
          <section key={slotType} className="weapons-view__unattached-section">
            <div className="weapons-view__unattached-header">
              <SlotIcon
                slotKey={slotType}
                compatibleModIds={[]}
                label={t(getSlotLabelKey(slotType))}
              />
              <h3>{t(getSlotLabelKey(slotType))}</h3>
              <span className="weapons-view__unattached-count">
                {unattached.length}
              </span>
            </div>
            <div className="weapons-view__unattached-grid">
              {unattached.map((instance) => {
                const modItem = itemsMap[instance.itemId];
                if (!modItem) return null;
                return (
                  <div
                    key={instance.instanceId}
                    className="weapons-view__card-slot"
                  >
                    <ItemIcon
                      itemId={modItem.id}
                      name={modItem.name}
                      icon={modItem.icon}
                      rarity={modItem.rarity}
                      quantity={1}
                      size="xs"
                      showName={false}
                      showQuantity={false}
                      tooltipContext={tooltipContext}
                    />
                    <div className="weapons-view__card-slot-names">{modItem.name}</div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {buildWeapon && (
        <div className="qm-modal-backdrop" role="presentation" onClick={closeBuildModal}>
          <div
            className="qm-modal weapons-view__build-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="weapons-build-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="weapons-view__modal-header">
              <h2 id="weapons-build-modal-title">
                {tm('quartermaster.weapons.build.title', { weapon: buildWeapon.name })}
              </h2>
              <button type="button" className="qm-button qm-button--icon" onClick={closeBuildModal} aria-label={t('quartermaster.weapons.build.cancel')}>
                <X size={16} />
              </button>
            </div>
            <label className="weapons-view__build-name">
              <span>{t('quartermaster.weapons.build.nameLabel')}</span>
              <input
                type="text"
                className="qm-input"
                placeholder={t('quartermaster.weapons.build.namePlaceholder')}
                value={buildName}
                onChange={(event) => setBuildName(event.target.value)}
              />
            </label>

            <div className="weapons-view__build-slots">
              {getWeaponSlotDefinitions(buildWeapon).map((slot) => {
                const compatibleModIds = slot.compatibleModIds;
                const compatibleMods = compatibleModIds
                  .map((modId) => itemsMap[modId])
                  .filter((mod): mod is PlannerItem => !!mod)
                  .sort((left, right) => compareText(left.name, right.name));

                return (
                  <fieldset key={slot.slotKey} className="weapons-view__build-slot">
                    <legend>{t(getSlotLabelKey(slot.slotKey))}</legend>
                    <div className="weapons-view__build-slot-options">
                      <button
                        type="button"
                        className={`weapons-view__build-option ${buildSlots[slot.slotKey] === null ? 'is-selected' : ''}`}
                        aria-pressed={buildSlots[slot.slotKey] === null}
                        onClick={() => setBuildSlots((prev) => ({ ...prev, [slot.slotKey]: null }))}
                      >
                        {t('quartermaster.weapons.build.slotNone')}
                      </button>
                      {compatibleMods.map((mod) => {
                        const craftability = plannerResult.craftability[mod.id];
                        const craftStatus = getCraftStatus(craftability);
                        const canCraft = craftStatus === 'craftable';
                        const showStatus = craftStatus !== 'unknown';
                        const selected = buildSlots[slot.slotKey] === mod.id;

                        return (
                          <button
                            key={mod.id}
                            type="button"
                            className={`weapons-view__build-option ${selected ? 'is-selected' : ''}`}
                            aria-pressed={selected}
                            onClick={() => setBuildSlots((prev) => ({ ...prev, [slot.slotKey]: mod.id }))}
                          >
                            {showStatus && (
                              <span
                                className={`weapons-view__build-option-status ${
                                  canCraft ? 'weapons-view__build-option-status--unlocked' : 'weapons-view__build-option-status--locked'
                                }`}
                                title={canCraft ? t('quartermaster.weapons.mod.canBeCrafted') : t('quartermaster.weapons.mod.cannotBeCrafted')}
                              >
                                {canCraft ? <CheckCircle2 size={14} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
                              </span>
                            )}
                            {mod.name}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
            </div>

            <div className="qm-modal__actions">
              {existingBuild && (
                <button type="button" className="qm-button qm-button--danger" onClick={deleteBuild}>
                  <Trash2 size={14} />
                  {t('quartermaster.weapons.build.delete')}
                </button>
              )}
              <button type="button" className="qm-button" onClick={closeBuildModal}>
                {t('quartermaster.weapons.build.cancel')}
              </button>
              <button type="button" className="qm-button qm-button--primary" onClick={saveBuild}>
                {t('quartermaster.weapons.build.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

}
