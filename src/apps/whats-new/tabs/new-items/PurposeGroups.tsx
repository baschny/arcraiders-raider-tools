import { useMemo } from 'react';
import { Rocket, ScrollText, Package } from 'lucide-react';
import { useLocale } from '../../../../shared/context/LocaleContext';
import { ItemGrid, ItemTile, PurposeGroup, type ItemRef } from '../../components';
import { toItemRef, type WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { capList, collapseRows, groupBySystem, mergeAmountRows, rarityRank } from './uses';
import {
  GUNSMITH_BENCH,
  RESEARCH_BENCH,
  buildPurposeGroups,
  selectionKey,
  type PurposeEntry,
  type PurposeGroupData,
  type PurposeId,
  type PurposeSource,
} from './groups';
import {
  benchLevelImage,
  resolveTargetView,
  resolveWhere,
  unlockMap,
  type RefLabels,
  type TargetView,
} from './refs';

const MAX_TARGETS = 8;

export interface PurposeGroupsProps {
  data: WhatsNewPageData;
  sources: readonly PurposeSource[];
  /** New items: adds the "No use yet" group and the "Recycles into" row. Old items: lost uses row. */
  mode: 'new' | 'old';
  /** `${group}:${item}` of the one open detail panel, or null. */
  selectedKey: string | null;
  onSelectedKeyChange: (key: string | null) => void;
}

function formatRowAmount(amount: number, max?: number): string {
  return max !== undefined && max !== amount ? `${amount}–${max}×` : `${amount}×`;
}

function GenericTile({ view, amount, size }: { view: Extract<TargetView, { kind: 'generic' }>; amount?: string; size: 48 | 64 }) {
  const Icon = view.icon === 'project' ? Rocket : view.icon === 'quest' ? ScrollText : Package;
  return (
    <div className={`wn-tile wn-tile--${size}`} title={view.label}>
      <span className="wn-nitems-generic" style={{ width: size, height: size }}>
        <Icon size={size / 2} aria-hidden="true" />
      </span>
      {amount && <span className="wn-tile__amount">{amount}</span>}
      <span className="wn-tile__name">{view.label}</span>
    </div>
  );
}

function TargetTile({ view, amount, size }: { view: TargetView; amount?: string; size: 48 | 64 }) {
  if (view.kind === 'generic') return <GenericTile view={view} amount={amount} size={size} />;
  return <ItemTile item={view.item} size={size} amount={amount} isBlueprint={view.isBlueprint} />;
}

interface DetailProps {
  data: WhatsNewPageData;
  entry: PurposeEntry;
  groupId: PurposeId;
  mode: 'new' | 'old';
  labels: RefLabels;
  unlocks: Map<string, string | undefined>;
}

function UseDetail({ data, entry, groupId, mode, labels, unlocks }: DetailProps) {
  const { t, tm } = useLocale();
  const { source } = entry;
  const ref = toItemRef(data.catalog, source.id);
  const blocks = groupBySystem(entry.uses).map(({ system, uses }) => ({
    system,
    rows: mergeAmountRows(system, collapseRows(uses)),
  }));
  const lost = useMemo(() => {
    if (mode !== 'old') return [];
    const seen = new Set<string>();
    const out: TargetView[] = [];
    for (const use of source.lost ?? []) {
      const view = resolveTargetView(data, use, use.target, unlocks, labels);
      if (!seen.has(view.key)) {
        seen.add(view.key);
        out.push(view);
      }
    }
    return out;
  }, [mode, source.lost, data, unlocks, labels]);
  const lostCapped = capList(lost, MAX_TARGETS);
  const recycles = mode === 'new' ? source.recyclesInto ?? [] : [];

  return (
    <div className="wn-nitems-detail">
      <h4 className="wn-nitems-detail__name">{ref.name}</h4>
      {groupId === 'researchPoints' && <p className="wn-nitems-detail__note">{t('whatsNew.new-items.detail.study')}</p>}
      {groupId === 'noUse' && <p className="wn-nitems-detail__note">{t('whatsNew.new-items.detail.noUse')}</p>}
      {blocks.map(({ system, rows }) => (
        <div className="wn-nitems-block" key={system}>
          {blocks.length > 1 && <h5 className="wn-nitems-block__heading">{t(`whatsNew.new-items.system.${system}`)}</h5>}
          {rows.map((row) => {
            const where = resolveWhere(data, row.use, labels, t('whatsNew.new-items.detail.posh'));
            const { shown, more } = capList(row.targets, MAX_TARGETS);
            const range = row.amountMax !== undefined && row.amountMax !== row.amount;
            const base = formatRowAmount(row.amount, row.amountMax);
            const label = !range && row.targets.length > 1 ? tm('whatsNew.new-items.detail.each', { n: row.amount }) : base;
            return (
              <div className="wn-nitems-use" key={`${row.amount}-${row.amountMax ?? ''}|${row.use.via ? JSON.stringify(row.use.via) : ''}`}>
                <span className="wn-nitems-use__amount">{label}</span>
                <div className="wn-nitems-use__targets">
                  {shown.map((target) => {
                    const view = resolveTargetView(data, { ...row.use, target }, target, unlocks, labels);
                    return <TargetTile key={view.key} view={view} size={64} />;
                  })}
                  {more > 0 && <span className="wn-nitems-use__more">{tm('whatsNew.new-items.detail.more', { n: more })}</span>}
                  {where && (
                    <span className="wn-nitems-use__where">
                      {where.image && <img className="wn-nitems-use__where-img" src={where.image} alt="" loading="lazy" />}
                      <span>{tm('whatsNew.new-items.detail.at', { where: where.label })}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {recycles.length > 0 && (
        <div className="wn-nitems-block">
          <h5 className="wn-nitems-block__heading">{t('whatsNew.new-items.recycles')}</h5>
          <div className="wn-nitems-use__targets">
            {recycles.map((a) => (
              <ItemTile key={a.itemId} item={toItemRef(data.catalog, a.itemId)} size={64} amount={a.quantity} />
            ))}
          </div>
        </div>
      )}
      {lost.length > 0 && (
        <div className="wn-nitems-block wn-nitems-block--lost">
          <h5 className="wn-nitems-block__heading">{t('whatsNew.old-items.noLonger')}</h5>
          <div className="wn-nitems-use__targets">
            {lostCapped.shown.map((view) => (
              <TargetTile key={view.key} view={view} size={48} />
            ))}
            {lostCapped.more > 0 && <span className="wn-nitems-use__more">{tm('whatsNew.new-items.detail.more', { n: lostCapped.more })}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

interface GroupIcon {
  iconImage?: string;
  iconItem?: ItemRef;
}

/** Representative image for a group header: bench image for stations, an item otherwise. */
function groupIcon(data: WhatsNewPageData, group: PurposeGroupData): GroupIcon {
  switch (group.id) {
    case 'researchStation': {
      const image = benchLevelImage(data, RESEARCH_BENCH, 1);
      if (image) return { iconImage: image };
      break;
    }
    case 'gunsmith4': {
      const image = benchLevelImage(data, GUNSMITH_BENCH, 4);
      if (image) return { iconImage: image };
      break;
    }
    case 'outpost': {
      for (const e of group.entries) {
        const room = e.uses.find((u) => u.system === 'outpostRoom' && typeof u.target === 'string');
        if (room) return { iconItem: toItemRef(data.catalog, room.target as string) };
      }
      break;
    }
    case 'amplified': {
      const module = group.entries.find((e) => e.source.id.startsWith('amplification_material'));
      if (module) return { iconItem: toItemRef(data.catalog, module.source.id) };
      break;
    }
    default:
      break;
  }
  const first = group.entries[0];
  return first ? { iconItem: toItemRef(data.catalog, first.source.id) } : {};
}

/**
 * The purpose groups of the New items and Old items tabs: one `PurposeGroup` with a selectable
 * `ItemGrid` per group, a single detail panel open across all of them (`selectedKey`).
 */
export function PurposeGroups({ data, sources, mode, selectedKey, onSelectedKeyChange }: PurposeGroupsProps) {
  const { t, tm } = useLocale();
  const labels = useMemo<RefLabels>(
    () => ({
      level: (bench, level) => tm('whatsNew.new-items.detail.level', { bench, level }),
      slots: (slots) => tm('whatsNew.new-items.detail.slots', { n: slots }),
    }),
    [tm],
  );
  const unlocks = useMemo(() => unlockMap(data), [data]);
  const groups = useMemo(() => {
    const info = (id: string) => toItemRef(data.catalog, id);
    return buildPurposeGroups(
      sources,
      {
        isAmplified: (slug) => slug.includes('amplified'),
      },
      {
        includeNoUse: mode === 'new',
        compare: (a, b) => {
          const ia = info(a.id);
          const ib = info(b.id);
          return rarityRank(ib.rarity) - rarityRank(ia.rarity) || ia.name.localeCompare(ib.name);
        },
      },
    );
  }, [sources, data.catalog, mode]);

  return (
    <>
      {groups.map((group) => {
        const icon = groupIcon(data, group);
        return (
          <PurposeGroup
            key={group.id}
            id={`wn-purpose-${group.id}`}
            title={t(`whatsNew.new-items.purpose.${group.id}.title`)}
            sentence={t(`whatsNew.new-items.purpose.${group.id}.sentence`)}
            {...icon}
          >
            <ItemGrid
              items={group.entries}
              getKey={(e) => selectionKey(group.id, e.source.id)}
              getDetailLabel={(e) => toItemRef(data.catalog, e.source.id).name}
              selectedKey={selectedKey}
              onSelectedKeyChange={onSelectedKeyChange}
              renderTile={(e, { selected, toggle }) => (
                <ItemTile item={toItemRef(data.catalog, e.source.id)} size={80} selected={selected} onClick={toggle} />
              )}
              renderDetail={(e) => <UseDetail data={data} entry={e} groupId={group.id} mode={mode} labels={labels} unlocks={unlocks} />}
            />
          </PurposeGroup>
        );
      })}
    </>
  );
}
