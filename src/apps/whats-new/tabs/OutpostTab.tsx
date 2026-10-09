import { useLocale } from '../../../shared/context/LocaleContext';
import { nameOf } from '../../../shared/gamedata/loader';
import { HowItWorks, ItemTile, NeedsCard, Panel, TabIntro } from '../components';
import type { HowItWorksStep, ItemRef } from '../components';
import type { WhatsNewPageData } from '../hooks/useWhatsNewData';
import { toItemRef } from '../hooks/useWhatsNewData';
import {
  buildExpansionTiers,
  celesteTrades,
  designExample,
  furnitureCount,
  pickFurnitureExamples,
  type ExpansionTier,
} from './outpost/data';
import { sortUnlocks, unlockBenchName } from './outpost/helpers';

export interface OutpostTabProps {
  data: WhatsNewPageData;
}

const SLOTS = 4;
const CELESTE_PORTRAIT = '/images/trader/celeste.png';

function ExpansionPanel({ tier, data }: { tier: ExpansionTier; data: WhatsNewPageData }) {
  const { t, tm } = useLocale();
  const unlocks = sortUnlocks(data, tier.unlocks);
  return (
    <Panel title={tm('whatsNew.outpost.expansion', { from: tier.from, to: tier.to })}>
      <div className="wn-outpost__cols">
        <section className="wn-outpost__col" aria-label={t('whatsNew.common.needs')}>
          <h4 className="wn-outpost__col-title">{t('whatsNew.common.needs')}</h4>
          <div className="wn-outpost__tiles">
            {tier.cost.map((c) => (
              <ItemTile key={c.item.id} item={c.item} size={64} amount={c.quantity} />
            ))}
          </div>
        </section>
        <section className="wn-outpost__col" aria-label={t('whatsNew.outpost.pickOne')}>
          <h4 className="wn-outpost__col-title">{t('whatsNew.outpost.pickOne')}</h4>
          <div className="wn-outpost__tiles">
            {tier.rooms.map((room) => (
              <div className="wn-outpost__room" key={room.item.id}>
                <ItemTile item={room.item} size={80} />
                {room.special && <span className="wn-outpost__special">{t('whatsNew.outpost.special')}</span>}
              </div>
            ))}
          </div>
        </section>
        <section className="wn-outpost__col" aria-label={t('whatsNew.outpost.unlocks')}>
          <h4 className="wn-outpost__col-title">{t('whatsNew.outpost.unlocks')}</h4>
          <ul className="wn-outpost__unlocks">
            {unlocks.map((u) => (
              <li className="wn-outpost__unlock" key={`${u.benchId}-${u.level}`}>
                {u.item.icon && <img className="wn-outpost__unlock-img" src={u.item.icon} alt="" loading="lazy" />}
                <span>{tm('whatsNew.outpost.benchLevel', { bench: unlockBenchName(data, u), level: u.level })}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Panel>
  );
}

function FurnitureExamples({ examples }: { examples: readonly ItemRef[] }) {
  return (
    <div className="wn-outpost__examples">
      {examples.map((item) => (
        <ItemTile key={item.id} item={item} size={80} />
      ))}
    </div>
  );
}

export function OutpostTab({ data }: OutpostTabProps) {
  const { t, tm } = useLocale();
  const { catalog } = data;
  const tiers = buildExpansionTiers(data);
  const examples = pickFurnitureExamples(data);
  const design = designExample(data);
  const trades = celesteTrades(data);
  const base = toItemRef(catalog, 'base_room');
  const celesteName = nameOf(data.trades, 'celeste', 'Celeste');
  const stationIcon = tiers.flatMap((x) => x.unlocks).find((u) => u.benchId === 'research_station')?.item.icon;

  const steps: HowItWorksStep[] = [
    { item: toItemRef(catalog, 'planks'), text: t('whatsNew.outpost.step1') },
    { item: base, text: t('whatsNew.outpost.step2') },
    { image: stationIcon, text: t('whatsNew.outpost.step3') },
  ];
  const fallback = examples[0]?.item;
  const furnitureSteps: HowItWorksStep[] = [
    { item: design?.design ?? fallback, text: t('whatsNew.outpost.furnStep1') },
    { item: base, text: t('whatsNew.outpost.furnStep2') },
    { item: toItemRef(catalog, 'planks'), text: t('whatsNew.outpost.furnStep3') },
  ];

  return (
    <div className="wn-tab wn-tab-outpost">
      <TabIntro title={t('whatsNew.intro.outpost.title')} sentence={t('whatsNew.intro.outpost.sentence')} />
      <HowItWorks steps={steps} />

      <Panel title={t('whatsNew.outpost.slots')} description={t('whatsNew.outpost.slotsText')}>
        <ol className="wn-outpost__slots">
          {Array.from({ length: SLOTS }, (_, i) => (
            <li className={`wn-outpost__slot${i === 0 ? ' is-filled' : ''}`} key={i}>
              <div className="wn-outpost__slot-box">
                {i === 0 ? <ItemTile item={base} size={112} hideName /> : <span className="wn-outpost__slot-num">{i + 1}</span>}
              </div>
              <span className="wn-outpost__slot-label">{i === 0 ? base.name : tm('whatsNew.outpost.slot', { n: i + 1 })}</span>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="wn-outpost__ladder">
        {tiers.map((tier) => (
          <ExpansionPanel key={tier.tier} tier={tier} data={data} />
        ))}
      </div>

      <Panel title={t('whatsNew.outpost.furnitureTitle')} description={t('whatsNew.outpost.furnitureText')}>
        <FurnitureExamples examples={examples.map((e) => e.item)} />
        <p className="wn-outpost__count">{tm('whatsNew.outpost.furnitureCount', { count: furnitureCount(data) })}</p>
        <HowItWorks steps={furnitureSteps} title={t('whatsNew.outpost.furnitureHow')} />
      </Panel>

      {trades.length > 0 && (
        <Panel title={tm('whatsNew.outpost.celeste', { name: celesteName })}>
          <div className="wn-outpost__celeste-head">
            <img className="wn-outpost__portrait" src={CELESTE_PORTRAIT} alt={celesteName} loading="lazy" />
            <p className="wn-outpost__celeste-text">{tm('whatsNew.outpost.celesteText', { name: celesteName })}</p>
          </div>
          <div className="wn-outpost__trades">
            {trades.map((trade) => (
              <NeedsCard
                key={trade.reward.item.id}
                result={{ item: trade.reward.item, amount: trade.reward.quantity }}
                needs={[{ item: trade.cost.item, amount: trade.cost.quantity }]}
              />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
