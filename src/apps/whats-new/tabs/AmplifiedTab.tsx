import { useMemo, useState } from 'react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { HowItWorks, ItemGrid, ItemTile, NeedsCard, Panel, TabIntro } from '../components';
import type { ItemRef, TileSpec } from '../components';
import { toItemRef, type WhatsNewPageData } from '../hooks/useWhatsNewData';
import { fragmentInfo, groupByModule } from './amplified/model';

export interface AmplifiedTabProps {
  data: WhatsNewPageData;
}

export function AmplifiedTab({ data }: AmplifiedTabProps) {
  const { t } = useLocale();
  const { catalog } = data;
  const ref = (slug: string) => toItemRef(catalog, slug);

  const groups = useMemo(() => groupByModule(data.amplification.structure, catalog), [data.amplification.structure, catalog]);
  const allWeapons = useMemo(() => groups.flatMap((g) => g.weapons), [groups]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = allWeapons.find((w) => w.baseId === selectedId) ?? allWeapons[0];

  const bench = data.benches.structure.benches.weapon_bench;
  const level4 = bench?.levels.find((l) => l.level === 4);
  const rooms = level4?.requires?.find((r) => r.kind === 'outpostLevel')?.id;
  const benchRef: ItemRef | undefined =
    bench && level4 ? { id: `${bench.id}-level-4`, name: `${bench.nameEn} ${t('whatsNew.amplified.level')} 4`, icon: level4.icon ?? undefined } : undefined;
  const { fragmentsId, recycles } = fragmentInfo(data.amplification.structure, catalog, allWeapons[0]?.moduleId);

  const steps = [
    { image: level4?.icon ?? undefined, text: t('whatsNew.amplified.step1') },
    ...(selected ? [{ item: ref(selected.amplifiedId), text: t('whatsNew.amplified.step2') }] : []),
    { item: ref('amplified_upgrade_part_a'), text: t('whatsNew.amplified.step3') },
  ];

  return (
    <div className="wn-tab wn-tab-amplified">
      <TabIntro title={t('whatsNew.intro.amplified.title')} sentence={t('whatsNew.intro.amplified.sentence')} />
      <HowItWorks steps={steps} />

      {benchRef && level4 && (
        <NeedsCard
          result={{ item: benchRef }}
          where={{ image: level4.icon ?? undefined, label: bench.nameEn }}
          needs={(level4.buildCost ?? []).map((c): TileSpec => ({ item: ref(c.itemId), amount: c.quantity }))}
          note={rooms ? t('whatsNew.amplified.roomsNote').replace('{n}', rooms) : undefined}
        />
      )}

      <Panel title={t('whatsNew.amplified.pickerTitle')} description={t('whatsNew.amplified.pickerSentence')}>
        <div className="wn-amp__groups">
          {groups.map(({ moduleId, weapons }) => (
            <section key={moduleId} className="wn-amp__group" aria-label={ref(moduleId).name}>
              <header className="wn-amp__group-head">
                <ItemTile item={ref(moduleId)} size={64} hideName />
                <h4 className="wn-amp__group-name">{ref(moduleId).name}</h4>
              </header>
              <ItemGrid>
                {weapons.map((w) => (
                  <ItemTile
                    key={w.baseId}
                    item={{ ...ref(w.amplifiedId), name: ref(w.fromItemId).name }}
                    size={80}
                    selected={selected?.baseId === w.baseId}
                    onClick={() => setSelectedId(w.baseId)}
                  />
                ))}
              </ItemGrid>
            </section>
          ))}
        </div>
      </Panel>

      {selected && (
        <Panel className="wn-amp__detail" highlighted title={ref(selected.fromItemId).name}>
          <div className="wn-amp__top">
            <ItemTile item={ref(selected.fromItemId)} size={112} />
            <span className="wn-amp__becomes">{t('whatsNew.amplified.becomes')}</span>
            <ItemTile item={ref(selected.amplifiedId)} size={112} />
            <div className="wn-amp__module">
              <h5 className="wn-amp__heading">{t('whatsNew.common.needs')}</h5>
              <ItemTile item={ref(selected.moduleId)} size={64} />
            </div>
          </div>
          <table className="wn-amp__perks">
            <thead>
              <tr>
                <th scope="col">{t('whatsNew.amplified.perk')}</th>
                <th scope="col">{t('whatsNew.common.needs')}</th>
                <th scope="col">{t('whatsNew.amplified.research')}</th>
              </tr>
            </thead>
            <tbody>
              {selected.perks.map((perk) => {
                const research = perk.researchId ? ref(perk.researchId) : undefined;
                return (
                  <tr key={`${perk.name}-${perk.researchId ?? ''}`}>
                    <th scope="row" className="wn-amp__perk-name">{research?.name ?? perk.name}</th>
                    <td>
                      <div className="wn-amp__cell">
                        {perk.parts.map((p) => (
                          <ItemTile key={p.itemId} item={ref(p.itemId)} size={48} amount={p.quantity} />
                        ))}
                      </div>
                    </td>
                    <td>
                      {research ? (
                        <ItemTile item={research} size={48} />
                      ) : (
                        <span className="wn-amp__none">{t('whatsNew.amplified.noResearch')}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}

      {fragmentsId && (
        <p className="wn-amp__footer">
          <ItemTile item={ref(fragmentsId)} size={48} hideName />
          <ItemTile item={ref(selected?.moduleId ?? allWeapons[0]?.moduleId ?? '')} size={48} hideName />
          <span>
            {t('whatsNew.amplified.repairLine')}{' '}
            {recycles ? t('whatsNew.amplified.recycleLine').replace('{n}', String(recycles)) : ''}
          </span>
        </p>
      )}
    </div>
  );
}
