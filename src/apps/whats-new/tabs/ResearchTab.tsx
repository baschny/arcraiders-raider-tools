import { useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { HowItWorks, ItemGrid, ItemTile, NeedsCard, Panel, SegmentedControl, TabIntro } from '../components';
import type { ItemRef, TileSpec } from '../components';
import type { WhatsNewPageData } from '../hooks/useWhatsNewData';
import { buildResearchData, RESEARCH_BENCH, type AmountRef, type ResearchData } from './research/data';

export interface ResearchTabProps {
  data: WhatsNewPageData;
}

type ListId = 'craftable' | 'findOnly' | 'designs';

/** One tile of the browse grid; `offer` is present for researchable entries. */
interface Entry {
  key: string;
  item: ItemRef;
  isBlueprint: boolean;
  offer?: { rp: number; level: number; inputs: AmountRef[] };
}

function entriesFor(rd: ResearchData, list: ListId): Entry[] {
  if (list === 'craftable') {
    return rd.craftable.map((c) => ({ key: c.offerId, item: c.unlocks, isBlueprint: true, offer: c }));
  }
  if (list === 'findOnly') return rd.findOnly.map((item) => ({ key: item.id, item, isBlueprint: true }));
  return [
    ...rd.designs.map((d) => ({ key: d.offerId, item: d.item, isBlueprint: false, offer: d })),
    ...rd.findOnlyDesigns.map((item) => ({ key: `found-${item.id}`, item, isBlueprint: false })),
  ];
}

export function ResearchTab({ data }: ResearchTabProps) {
  const { t, tm } = useLocale();
  const rd = useMemo(() => buildResearchData(data), [data]);
  const [list, setList] = useState<ListId>('craftable');

  const benchName = data.benches.text[RESEARCH_BENCH]?.name ?? data.benches.structure.benches[RESEARCH_BENCH]?.nameEn ?? '';
  const levelIcon = (level: number) => rd.levels.find((l) => l.level === level)?.icon;
  const entries = useMemo(() => entriesFor(rd, list), [rd, list]);
  const rpText = (rp: number) => tm('whatsNew.research.rpAmount', { n: rp });

  const steps = [
    { item: rd.study[0]?.item, text: t('whatsNew.research.step1') },
    { item: rd.rp, text: t('whatsNew.research.step2') },
    { item: rd.samples.blueprint, isBlueprint: true, text: t('whatsNew.research.step3') },
    { image: levelIcon(1), text: t('whatsNew.research.step4') },
  ];

  const needsOf = (offer: NonNullable<Entry['offer']>): TileSpec[] =>
    offer.inputs.map((a) => ({ item: a.item, amount: a.item.id === rd.rp.id ? rpText(a.quantity ?? 0) : a.quantity }));

  const options = [
    { value: 'craftable' as const, label: t('whatsNew.research.listCraftable') },
    { value: 'findOnly' as const, label: t('whatsNew.research.listFindOnly') },
    { value: 'designs' as const, label: t('whatsNew.research.listDesigns') },
  ];

  const tracks = [
    { id: 'blueprint', title: t('whatsNew.research.blueprintCrafting'), count: rd.blueprintCount, item: rd.samples.blueprint, isBlueprint: true, locked: false },
    { id: 'design', title: t('whatsNew.research.designCrafting'), count: rd.designCount, item: rd.samples.design, isBlueprint: false, locked: false },
    { id: 'amplified', title: t('whatsNew.research.amplifiedResearch'), count: rd.amplifiedCount, item: rd.samples.amplified, isBlueprint: false, locked: true },
  ];

  const sublabelOf = (entry: Entry): string | undefined => {
    if (entry.offer) return tm('whatsNew.research.rpLevel', { rp: entry.offer.rp, n: entry.offer.level });
    return list === 'designs' ? t('whatsNew.research.foundOnly') : undefined;
  };

  return (
    <div className="wn-tab wn-tab-research">
      <TabIntro title={t('whatsNew.intro.research.title')} sentence={t('whatsNew.intro.research.sentence')} />
      <HowItWorks steps={steps.filter((s) => s.item || s.image)} />

      <Panel title={t('whatsNew.research.pointsTitle')} description={t('whatsNew.research.pointsText')}>
        <div className="wn-research__points">
          {rd.study.map((s) => (
            <ItemTile key={s.item.id} item={s.item} size={112} amount={rpText(s.rp)} />
          ))}
        </div>
      </Panel>

      <Panel title={t('whatsNew.research.stationTitle')} description={tm('whatsNew.research.stationText', { bench: benchName })}>
        <div className="wn-research__levels">
          {rd.levels.map((l) => (
            <div className="wn-research__level" key={l.level}>
              {l.icon && <img className="wn-research__level-img" src={l.icon} alt="" loading="lazy" />}
              <h4 className="wn-research__level-name">
                {l.level === 1 ? t('whatsNew.research.build') : tm('whatsNew.research.level', { n: l.level })}
              </h4>
              <div className="wn-research__level-cost">
                {l.cost.map((a) => (
                  <ItemTile key={a.item.id} item={a.item} size={48} amount={a.quantity} />
                ))}
              </div>
              {l.rooms !== undefined && (
                <span className="wn-research__level-rooms">
                  {tm(l.rooms === 1 ? 'whatsNew.research.needsRoom' : 'whatsNew.research.needsRooms', { n: l.rooms })}
                </span>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <div className="wn-research__tracks">
        {tracks.map((track) => (
          <Panel key={track.id} title={track.title} className={`wn-research__track wn-research__track--${track.id}${track.locked ? ' wn-research__track--locked' : ''}`}>
            {track.item && <ItemTile item={track.item} size={64} isBlueprint={track.isBlueprint} hideName />}
            <span className="wn-research__track-count">{tm('whatsNew.research.plans', { n: track.count })}</span>
            {track.locked && (
              <span className="wn-research__track-note">
                <Lock size={16} aria-hidden="true" /> {tm('whatsNew.research.needsStationLevel', { n: rd.amplifiedLevel })}
              </span>
            )}
          </Panel>
        ))}
      </div>

      <section className="wn-research__browse">
        <div className="wn-research__browse-head">
          <h3 className="wn-research__browse-title">{t('whatsNew.research.browseTitle')}</h3>
          <SegmentedControl options={options} value={list} onChange={setList} ariaLabel={t('whatsNew.research.browseTitle')} />
        </div>
        <ItemGrid
          key={list}
          minTile={112}
          items={entries}
          getKey={(e) => e.key}
          getDetailLabel={(e) => e.item.name}
          renderTile={(e, { selected, toggle }) => (
            <ItemTile
              item={e.item}
              size={80}
              isBlueprint={e.isBlueprint}
              sublabel={sublabelOf(e)}
              selected={selected}
              onClick={e.offer ? toggle : undefined}
            />
          )}
          renderDetail={(e) =>
            e.offer ? (
              <NeedsCard
                result={{ item: e.item, isBlueprint: e.isBlueprint }}
                where={{ image: levelIcon(e.offer.level), label: tm('whatsNew.research.benchLevel', { bench: benchName, n: e.offer.level }) }}
                needs={needsOf(e.offer)}
              />
            ) : null
          }
        />
      </section>
    </div>
  );
}
