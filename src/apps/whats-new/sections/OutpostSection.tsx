import { useLocale } from '../../../shared/context/LocaleContext';
import { nameOf } from '../../../shared/gamedata/loader';
import { Counter, FlowStrip, GamePanel, ItemChip, SectionHeader } from '../components';
import type { FlowStep } from '../components';
import type { SectionProps } from './types';
import {
  buildExpansionTiers,
  celesteTrades,
  designExample,
  furnitureCount,
  learnExamples,
  pickFurnitureExamples,
  type ExpansionTier,
  type RoomOption,
} from './outpost/data';

const ANCHOR = 'outpost';
const SLOTS = 4;
const CELESTE_PORTRAIT = '/images/trader/celeste.png';

function RoomTile({ room, specialLabel }: { room: RoomOption; specialLabel: string }) {
  return (
    <div className={`wn-outpost__room${room.special ? ' wn-outpost__room--special' : ''}`}>
      {room.image && <img className="wn-outpost__room-image" src={room.image} alt="" loading="lazy" />}
      <ItemChip item={room.item} size="md" showName />
      {room.special && <span className="wn-outpost__room-tag">{specialLabel}</span>}
    </div>
  );
}

function SlotLadder({ filled, baseName, baseIcon }: { filled: number; baseName: string; baseIcon?: string }) {
  return (
    <ol className="wn-outpost__slots">
      {Array.from({ length: SLOTS }, (_, i) => (
        <li key={i} className={`wn-outpost__slot${i < filled ? ' wn-outpost__slot--filled' : ''}`}>
          <span className="wn-outpost__slot-num">{i + 1}</span>
          {i === 0 && baseIcon ? <img src={baseIcon} alt={baseName} loading="lazy" /> : <span aria-hidden="true">{i < filled ? '' : '+'}</span>}
        </li>
      ))}
    </ol>
  );
}

export function OutpostSection({ data, variant }: SectionProps) {
  const { t, tm } = useLocale();
  const { catalog } = data;
  const tiers = buildExpansionTiers(data);
  const furniture = pickFurnitureExamples(data);
  const example = designExample(data);
  const learn = learnExamples(data);
  const trades = celesteTrades(data);
  const base = catalog.items['base_room'];
  const celesteName = nameOf(data.trades, 'celeste', 'Celeste');
  const specialLabel = t('whatsNew.outpost.special');
  const expandTitle = (tier: ExpansionTier) => tm('whatsNew.outpost.expand', { from: tier.from, to: tier.to });

  const stripFor = (tier: ExpansionTier): FlowStep[] => [
    { title: t('whatsNew.outpost.materials'), items: tier.cost.map((a) => ({ item: a.item, quantity: a.quantity, size: 'md' as const })) },
    {
      title: t('whatsNew.outpost.chooseRoom'),
      items: tier.rooms.map((r) => ({ item: r.item, showName: true, size: 'md' as const })),
    },
    {
      title: t('whatsNew.outpost.unlocks'),
      note: tm('whatsNew.outpost.rooms', { count: tier.to }),
      items: tier.unlocks.map((u) => ({ item: u.item, size: 'md' as const })),
    },
  ];

  const panelFor = (tier: ExpansionTier) => (
    <GamePanel key={tier.tier} className="wn-outpost__panel" title={expandTitle(tier)} counter={`${tier.to}/${SLOTS}`}>
      <ul className="wn-outpost__lines">
        {tier.unlocks.map((u) => (
          <li key={u.item.id} className="wn-outpost__line">
            {u.item.icon && <img src={u.item.icon} alt="" loading="lazy" />}
            <span>{tm('whatsNew.outpost.canUpgrade', { bench: nameOf(data.benches, u.benchId, u.benchId), level: u.level })}</span>
          </li>
        ))}
        <li className="wn-outpost__line">
          {base?.icon && <img src={base.icon} alt="" loading="lazy" />}
          <span>{t('whatsNew.outpost.newRoom')}</span>
        </li>
      </ul>
      <div className="wn-outpost__row">
        {tier.cost.map((a) => (
          <ItemChip key={a.item.id} item={a.item} quantity={a.quantity} size="md" showName />
        ))}
      </div>
      <div className="wn-outpost__row wn-outpost__row--rooms">
        {tier.rooms.map((r) => (
          <RoomTile key={r.item.id} room={r} specialLabel={specialLabel} />
        ))}
      </div>
    </GamePanel>
  );

  const buildItems = ['planks', 'sheet_metal'].map((id) => {
    const it = catalog.items[id];
    return { item: { id, name: it?.name ?? id, icon: it?.icon, rarity: it?.rarity }, size: 'md' as const };
  });
  const flow: FlowStep[] = example
    ? [
        { title: t('whatsNew.outpost.design'), note: t('whatsNew.outpost.designSource'), items: [{ item: example.design, size: 'md' }] },
        { title: t('whatsNew.outpost.learn'), note: t('whatsNew.outpost.consumed') },
        { title: t('whatsNew.outpost.build'), items: buildItems },
        { title: t('whatsNew.outpost.furniture'), items: [{ item: example.furniture, size: 'md' }] },
      ]
    : [];

  return (
    <section className="wn-section wn-outpost" aria-labelledby={ANCHOR}>
      <SectionHeader id={ANCHOR} title={t('whatsNew.section.outpost.title')} subtitle={t('whatsNew.section.outpost.subtitle')} />
      <div className="wn-section__body">
        <SlotLadder filled={1} baseName={base?.name ?? ''} baseIcon={base?.icon} />

        <div className="wn-outpost__tiers">
          {tiers.map((tier) =>
            variant === 'b' ? (
              panelFor(tier)
            ) : (
              <div className="wn-outpost__tier" key={tier.tier}>
                <h3 className="wn-outpost__tier-title">{expandTitle(tier)}</h3>
                <FlowStrip steps={stripFor(tier)} />
                {tier.rooms.some((r) => r.image) && (
                  <div className="wn-outpost__row wn-outpost__row--rooms">
                    {tier.rooms.map((r) => (
                      <RoomTile key={r.item.id} room={r} specialLabel={specialLabel} />
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
        </div>

        <div className="wn-outpost__block wn-outpost__learn">
          <h3 className="wn-outpost__block-title">{t('whatsNew.outpost.learnHere')}</h3>
          <div className="wn-outpost__row wn-outpost__row--scroll">
            {[...learn.blueprints, ...learn.designs].map((item) => (
              <ItemChip key={item.id} item={item} size="sm" />
            ))}
          </div>
        </div>

        <div className="wn-outpost__block wn-outpost__furniture">
          <div className="wn-outpost__block-head">
            <h3 className="wn-outpost__block-title">{t('whatsNew.outpost.furnitureTitle')}</h3>
            <Counter label={t('whatsNew.outpost.pieces')} value={furniture.length} total={furnitureCount(data)} />
          </div>
          <div className="wn-outpost__row wn-outpost__row--scroll">
            {furniture.map((f) => (
              <ItemChip key={f.category} item={f.item} size="md" showName />
            ))}
          </div>
          {flow.length > 0 && <FlowStrip steps={flow} />}
        </div>

        {trades.length > 0 && (
          <aside className="wn-outpost__celeste">
            <img className="wn-outpost__celeste-portrait" src={CELESTE_PORTRAIT} alt={celesteName} loading="lazy" />
            <div className="wn-outpost__celeste-body">
              <div className="wn-outpost__block-title">{tm('whatsNew.outpost.celeste', { name: celesteName })}</div>
              <div className="wn-outpost__row">
                {trades.map((tr) => (
                  <div className="wn-outpost__trade" key={tr.reward.item.id}>
                    <ItemChip item={tr.cost.item} quantity={tr.cost.quantity} size="sm" />
                    <span aria-hidden="true">→</span>
                    <ItemChip item={tr.reward.item} quantity={tr.reward.quantity} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
