import { useMemo, useState } from 'react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { HowItWorks, ItemGrid, ItemTile, NeedsCard, Panel, TabIntro } from '../components';
import type { ItemRef, TileSpec } from '../components';
import { toItemRef, type WhatsNewPageData } from '../hooks/useWhatsNewData';
import { fragmentInfo, groupByModule } from './amplified/model';
import type { WeaponRow } from './amplified/derive';

export interface AmplifiedTabProps {
  data: WhatsNewPageData;
}

type RefFn = (slug: string) => ItemRef;

/** Amplified variants always carry the Amplified (orange) rarity frame. */
const amplified = (item: ItemRef): ItemRef => ({ ...item, rarity: 'Amplified' });

function WeaponDetail({ weapon, ref_ }: { weapon: WeaponRow; ref_: RefFn }) {
  const { t } = useLocale();
  const base = ref_(weapon.fromItemId);
  return (
    <div className="wn-amp__detail">
      <header className="wn-amp__top">
        <ItemTile item={base} size={64} hideName />
        <span className="wn-amp__becomes">{t('whatsNew.amplified.becomes')}</span>
        <ItemTile item={amplified(ref_(weapon.amplifiedId))} size={64} hideName />
        <div className="wn-amp__title">
          <h4 className="wn-amp__detail-name">{base.name}</h4>
          <div className="wn-amp__module">
            <span className="wn-amp__heading">{t('whatsNew.common.needs')}</span>
            <ItemTile item={ref_(weapon.moduleId)} size={48} />
          </div>
        </div>
      </header>
      <div className="wn-amp__table" role="table">
        <div className="wn-amp__row wn-amp__row--head" role="row">
          <span role="columnheader">{t('whatsNew.amplified.amplification')}</span>
          <span role="columnheader">{t('whatsNew.common.needs')}</span>
          <span role="columnheader">{t('whatsNew.amplified.research')}</span>
        </div>
        {weapon.amplifications.map((amp) => {
          const research = amp.researchId ? ref_(amp.researchId) : undefined;
          return (
            <div className="wn-amp__row" role="row" key={`${amp.name}-${amp.researchId ?? ''}`}>
              <span className="wn-amp__amp-name" role="rowheader">{research?.name ?? amp.name}</span>
              <div className="wn-amp__cell" role="cell" data-label={t('whatsNew.common.needs')}>
                {amp.parts.map((p) => (
                  <ItemTile key={p.itemId} item={ref_(p.itemId)} size={48} amount={p.quantity} />
                ))}
              </div>
              <div className="wn-amp__cell" role="cell" data-label={t('whatsNew.amplified.research')}>
                {research ? (
                  <ItemTile item={research} size={48} />
                ) : (
                  <span className="wn-amp__none">{t('whatsNew.amplified.noResearch')}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AmplifiedTab({ data }: AmplifiedTabProps) {
  const { t } = useLocale();
  const { catalog } = data;
  const ref = (slug: string) => toItemRef(catalog, slug);

  const groups = useMemo(() => groupByModule(data.amplification.structure, catalog), [data.amplification.structure, catalog]);
  const allWeapons = useMemo(() => groups.flatMap((g) => g.weapons), [groups]);
  // undefined = nothing chosen yet, so the first weapon is open; null = the user closed the panel.
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const openId = selectedId === undefined ? allWeapons[0]?.baseId ?? null : selectedId;
  const selected = allWeapons.find((w) => w.baseId === openId) ?? allWeapons[0];

  const bench = data.benches.structure.benches.weapon_bench;
  const level4 = bench?.levels.find((l) => l.level === 4);
  const rooms = level4?.requires?.find((r) => r.kind === 'outpostLevel')?.id;
  const benchRef: ItemRef | undefined =
    bench && level4 ? { id: `${bench.id}-level-4`, name: `${bench.nameEn} ${t('whatsNew.amplified.level')} 4`, icon: level4.icon ?? undefined } : undefined;
  const { fragmentsId, recycles } = fragmentInfo(data.amplification.structure, catalog, allWeapons[0]?.moduleId);

  const steps = [
    { image: level4?.icon ?? undefined, text: t('whatsNew.amplified.step1') },
    ...(selected ? [{ item: amplified(ref(selected.amplifiedId)), text: t('whatsNew.amplified.step2') }] : []),
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
              <ItemGrid
                items={weapons}
                getKey={(w) => w.baseId}
                getDetailLabel={(w) => ref(w.fromItemId).name}
                selectedKey={openId}
                onSelectedKeyChange={setSelectedId}
                renderTile={(w, { selected: isSelected, toggle }) => (
                  <ItemTile
                    item={ref(w.fromItemId)}
                    size={80}
                    selected={isSelected}
                    onClick={toggle}
                  />
                )}
                renderDetail={(w) => <WeaponDetail weapon={w} ref_={ref} />}
              />
            </section>
          ))}
        </div>
      </Panel>

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
