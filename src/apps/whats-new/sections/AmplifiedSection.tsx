import { useMemo } from 'react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { ItemChip, SectionHeader } from '../components';
import { toItemRef } from '../hooks/useWhatsNewData';
import { moduleOrder, weaponRows, type PerkInfo, type WeaponRow } from './amplified/derive';
import type { SectionProps } from './types';

const PERK_PART_IDS = [
  'amplified_upgrade_part_a',
  'amplified_upgrade_part_b',
  'amplified_upgrade_part_c',
  'amplified_upgrade_part_d',
];

export function AmplifiedSection({ data }: SectionProps) {
  const { t } = useLocale();
  const { catalog } = data;
  const ref = (slug: string) => toItemRef(catalog, slug);

  const rows = useMemo(() => weaponRows(data.amplification.structure), [data.amplification.structure]);

  const groups = useMemo(() => {
    const byModule = new Map<string, WeaponRow[]>();
    for (const row of rows) byModule.set(row.moduleId, [...(byModule.get(row.moduleId) ?? []), row]);
    return [...byModule.entries()]
      .map(([moduleId, list]) => ({ moduleId, list, order: moduleOrder(catalog.items[moduleId]?.name ?? '') }))
      .sort((a, b) => a.order - b.order);
  }, [rows, catalog]);

  const partUsage = useMemo(() => {
    const usage = new Map<string, number>();
    for (const row of rows) {
      const parts = new Set(row.perks.flatMap((p) => p.parts.map((x) => x.itemId)));
      for (const id of parts) usage.set(id, (usage.get(id) ?? 0) + 1);
    }
    return [...usage.entries()].sort((a, b) => {
      const ai = PERK_PART_IDS.indexOf(a[0]);
      const bi = PERK_PART_IDS.indexOf(b[0]);
      if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      return b[1] - a[1];
    });
  }, [rows]);

  const bench = data.benches.structure.benches.weapon_bench;
  const level4 = bench?.levels.find((l) => l.level === 4);
  const rooms = level4?.requires?.find((r) => r.kind === 'outpostLevel')?.id;
  const fragmentsId = Object.values(data.amplification.structure.weapons)[0]?.repairItemId;
  const moduleRecycle =
    rows[0] && fragmentsId ? catalog.items[rows[0].moduleId]?.recyclesInto?.[fragmentsId] : undefined;

  const perkTitle = (perk: PerkInfo) => {
    const research = perk.researchId ? ref(perk.researchId).name : null;
    return research ? `${perk.name} — ${research}` : perk.name;
  };

  return (
    <section className="wn-section wn-amplified" aria-labelledby="amplified">
      <SectionHeader
        id="amplified"
        title={t('whatsNew.section.amplified.title')}
        subtitle={t('whatsNew.section.amplified.subtitle')}
      />

      <div className="wn-amplified__strip">
        {bench && level4 && (
          <div className="wn-amplified__card">
            <span className="wn-amplified__card-label">{bench.nameEn}</span>
            <div className="wn-amplified__bench-tiers">
              {bench.levels
                .filter((l) => l.level === 3 || l.level === 4)
                .map((l, i) => (
                  <span key={l.level} className="wn-amplified__tier">
                    {i > 0 && <span className="wn-amplified__op" aria-hidden="true">→</span>}
                    {l.icon && (
                      <img className="wn-amplified__tier-img" src={l.icon} alt={`${bench.nameEn} ${l.level}`} loading="lazy" />
                    )}
                    <span className="wn-amplified__tier-level">{l.level}</span>
                  </span>
                ))}
            </div>
            <div className="wn-amplified__cost">
              {(level4.buildCost ?? []).map((c) => (
                <ItemChip key={c.itemId} item={ref(c.itemId)} quantity={c.quantity} size="sm" />
              ))}
              {rooms && (
                <span className="wn-amplified__tag" title={t('whatsNew.amplified.roomsHint')}>
                  {rooms} {t('whatsNew.amplified.rooms')}
                </span>
              )}
            </div>
          </div>
        )}
        {fragmentsId && (
          <div className="wn-amplified__card">
            <ItemChip item={ref(fragmentsId)} size="sm" />
            <span className="wn-amplified__note">{t('whatsNew.amplified.repair')}</span>
            {moduleRecycle && (
              <span className="wn-amplified__tag" title={t('whatsNew.amplified.recycleHint')}>
                {t('whatsNew.amplified.module')} → ×{moduleRecycle}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="wn-amplified__groups">
        {groups.map(({ moduleId, list }) => (
          <div key={moduleId} className="wn-amplified__group">
            <div className="wn-amplified__group-head">
              <ItemChip item={ref(moduleId)} size="sm" />
              <span className="wn-amplified__group-title">{ref(moduleId).name}</span>
              <span className="wn-amplified__tag">{list.length}</span>
            </div>
            {list.map((row) => (
              <div key={row.baseId} className="wn-amplified__row">
                <div className="wn-amplified__flow">
                  <ItemChip item={ref(row.fromItemId)} size="sm" />
                  <span className="wn-amplified__op" aria-hidden="true">+</span>
                  <ItemChip item={ref(row.moduleId)} size="sm" />
                  <span className="wn-amplified__op" aria-hidden="true">→</span>
                  <ItemChip item={ref(row.amplifiedId)} size="sm" />
                </div>
                <div className="wn-amplified__perks">
                  {row.perks.map((perk) => (
                    <span key={perk.name} className="wn-amplified__perk" title={perkTitle(perk)}>
                      {perk.parts.map((p) => (
                        <ItemChip key={p.itemId} item={ref(p.itemId)} quantity={p.quantity} size="sm" />
                      ))}
                      {perk.researchId && (
                        <>
                          <span className="wn-amplified__op" aria-hidden="true">+</span>
                          <ItemChip item={ref(perk.researchId)} size="sm" />
                        </>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="wn-amplified__parts">
        <span className="wn-amplified__card-label">{t('whatsNew.amplified.perkParts')}</span>
        {partUsage.map(([id, count]) => (
          <span key={id} className="wn-amplified__part" title={ref(id).name}>
            <ItemChip item={ref(id)} size="sm" />
            <span className="wn-amplified__tag">
              {count} {t('whatsNew.amplified.weapons')}
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}
