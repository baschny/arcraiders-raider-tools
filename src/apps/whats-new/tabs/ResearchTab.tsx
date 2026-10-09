import { useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { formatAmount, GlyphIcon, HowItWorks, ItemGrid, ItemHoverCard, ItemTile, NeedsCard, Panel, SegmentedControl, TabIntro } from '../components';
import type { HoverRow, ItemRef } from '../components';
import type { WhatsNewPageData } from '../hooks/useWhatsNewData';
import {
  buildResearchData,
  groupByLevelAndPrice,
  RESEARCH_BENCH,
  sortByRarityThenName,
  type ResearchOffer,
} from './research/data';

export interface ResearchTabProps {
  data: WhatsNewPageData;
}

type ListId = 'craftable' | 'findOnly' | 'designs' | 'findOnlyDesigns';

const TILE = 80;
const GRID_MIN = 96;

export function ResearchTab({ data }: ResearchTabProps) {
  const { t, tm, formatNumber } = useLocale();
  const rd = useMemo(() => buildResearchData(data), [data]);
  const [list, setList] = useState<ListId>('craftable');

  const benchName = data.benches.text[RESEARCH_BENCH]?.name ?? data.benches.structure.benches[RESEARCH_BENCH]?.nameEn ?? '';
  const levelIcon = (level: number) => rd.levels.find((l) => l.level === level)?.icon;
  const rpText = (rp: number) => tm('whatsNew.research.rpAmount', { n: formatNumber(rp) });
  const benchLevelText = (n: number) => tm('whatsNew.research.benchLevel', { bench: benchName, n });

  // The researchable lists show the unlocked item (blueprints: in the blueprint frame; designs: the furniture).
  const blueprintOffers = useMemo<ResearchOffer[]>(
    () => rd.craftable.map((c) => ({ offerId: c.offerId, item: c.unlocks, rp: c.rp, level: c.level, inputs: c.inputs })),
    [rd],
  );
  const groups = useMemo(
    () => groupByLevelAndPrice(list === 'craftable' ? blueprintOffers : list === 'designs' ? rd.designs : []),
    [list, blueprintOffers, rd],
  );
  const findOnly = useMemo(
    () => sortByRarityThenName(list === 'findOnly' ? rd.findOnly : list === 'findOnlyDesigns' ? rd.findOnlyDesigns : []),
    [list, rd],
  );
  const isBlueprint = list === 'craftable' || list === 'findOnly';

  const steps = [
    { item: rd.study[0]?.item, text: t('whatsNew.research.step1') },
    { item: rd.rp, text: t('whatsNew.research.step2') },
    { item: rd.samples.blueprint, isBlueprint: true, text: t('whatsNew.research.step3') },
    { image: levelIcon(1), text: t('whatsNew.research.step4') },
  ];

  const options = [
    { value: 'craftable' as const, label: t('whatsNew.research.listCraftable') },
    { value: 'findOnly' as const, label: t('whatsNew.research.listFindOnly') },
    { value: 'designs' as const, label: t('whatsNew.research.listDesigns') },
    { value: 'findOnlyDesigns' as const, label: t('whatsNew.research.listFindOnlyDesigns') },
  ];

  const tracks = [
    { id: 'blueprint', title: t('whatsNew.research.blueprintCrafting'), count: rd.blueprintCount, item: rd.samples.blueprint, isBlueprint: true, locked: false },
    { id: 'design', title: t('whatsNew.research.designCrafting'), count: rd.designCount, item: rd.samples.design, isBlueprint: false, locked: false },
    { id: 'amplified', title: t('whatsNew.research.amplifiedResearch'), count: rd.amplifiedCount, item: rd.samples.amplified, isBlueprint: false, locked: true },
  ];

  const hoverSections = (o: ResearchOffer) => {
    const rows: HoverRow[] = [...o.inputs]
      .sort((a, b) => Number(b.item.id === rd.rp.id) - Number(a.item.id === rd.rp.id))
      .map((a, i) => ({
        key: `${a.item.id}-${i}`,
        item: a.item,
        label: a.item.name,
        amount: a.item.id === rd.rp.id ? rpText(a.quantity ?? o.rp) : formatAmount(a.quantity ?? 1),
      }));
    rows.push({ key: 'where', image: levelIcon(o.level), label: benchLevelText(o.level), detail: t('whatsNew.common.where') });
    return [{ key: 'research', title: t('whatsNew.research.hoverTitle'), rows }];
  };

  const levelItem = (level: number): ItemRef => ({ id: `${RESEARCH_BENCH}-${level}`, name: level === 1 ? t('whatsNew.research.build') : benchLevelText(level), icon: levelIcon(level) });

  return (
    <div className="wn-tab wn-tab-research">
      <TabIntro title={t('whatsNew.intro.research.title')} sentence={t('whatsNew.intro.research.sentence')} />
      <HowItWorks steps={steps.filter((s) => s.item || s.image)} />

      <Panel title={t('whatsNew.research.pointsTitle')} description={t('whatsNew.research.pointsText')}>
        <div className="wn-research__units">
          {rd.study.map((s) => (
            <div className="wn-research__unit" key={s.item.id}>
              <ItemTile item={s.item} size={112} amount={rpText(s.rp)} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={t('whatsNew.research.stationTitle')} description={tm('whatsNew.research.stationText', { bench: benchName })}>
        <div className="wn-research__cards">
          {rd.levels.map((l) => (
            <NeedsCard
              key={l.level}
              layout="compact"
              result={{ item: levelItem(l.level) }}
              title={
                l.level === 1 ? (
                  t('whatsNew.research.build')
                ) : (
                  <>
                    <span className="wn-needs__headline-pre">{benchName}</span>
                    {tm('whatsNew.research.level', { n: l.level })}
                  </>
                )
              }
              needs={l.cost.map((a) => ({ item: a.item, amount: a.quantity }))}
              note={l.rooms !== undefined ? tm(l.rooms === 1 ? 'whatsNew.research.needsRoom' : 'whatsNew.research.needsRooms', { n: l.rooms }) : undefined}
            />
          ))}
        </div>
      </Panel>

      <div className="wn-research__tracks">
        {tracks.map((track) => (
          <article key={track.id} className={`wn-research__track wn-research__track--${track.id}${track.locked ? ' wn-research__track--locked' : ''}`}>
            <h4 className="wn-research__track-title">{track.title}</h4>
            {track.item && <ItemTile item={track.item} size={64} isBlueprint={track.isBlueprint} hideName />}
            <span className="wn-research__track-count">{tm('whatsNew.research.plans', { n: track.count })}</span>
            {track.locked && (
              <span className="wn-research__track-note">
                <Lock size={16} aria-hidden="true" /> {tm('whatsNew.research.needsStationLevel', { n: rd.amplifiedLevel })}
              </span>
            )}
          </article>
        ))}
      </div>

      <section className="wn-research__browse">
        <div className="wn-research__browse-head">
          <h3 className="wn-research__browse-title">{t('whatsNew.research.browseTitle')}</h3>
          <SegmentedControl options={options} value={list} onChange={setList} ariaLabel={t('whatsNew.research.browseTitle')} />
        </div>

        {groups.map((g) => (
          <section className="wn-research__level-group" key={g.level}>
            <h4 className="wn-research__level-heading">
              <GlyphIcon name="research-station" size={28} />
              {tm('whatsNew.research.level', { n: g.level })}
            </h4>
            {g.prices.map((p) => (
              <div className="wn-research__price-group" key={p.rp}>
                <h5 className="wn-research__price-heading">
                  <GlyphIcon name="research-points" size={20} />
                  {rpText(p.rp)}
                </h5>
                <ItemGrid minTile={GRID_MIN}>
                  {p.offers.map((o) => (
                    <ItemHoverCard key={o.offerId} item={o.item} sections={hoverSections(o)}>
                      <ItemTile item={o.item} size={TILE} isBlueprint={isBlueprint} />
                    </ItemHoverCard>
                  ))}
                </ItemGrid>
              </div>
            ))}
          </section>
        ))}

        {findOnly.length > 0 && (
          <section className="wn-research__level-group">
            <div className="wn-research__price-group">
              <ItemGrid minTile={GRID_MIN}>
                {findOnly.map((item) => (
                  <ItemTile key={item.id} item={item} size={TILE} isBlueprint={isBlueprint} />
                ))}
              </ItemGrid>
            </div>
          </section>
        )}
      </section>
    </div>
  );
}
