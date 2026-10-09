import { useMemo, useState } from 'react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { nameOf } from '../../../shared/gamedata/loader';
import type { WhatsNewTradeLine } from '../../../shared/gamedata/types';
import { Package, Recycle } from 'lucide-react';
import { CompareRows, ItemGrid, ItemTile, PurposeGroup, SegmentedControl, TabIntro } from '../components';
import type { ItemRef } from '../components';
import { toItemRef, type WhatsNewPageData } from '../hooks/useWhatsNewData';
import { NowLabel } from '../components/NowLabel';
import { TRADER_PORTRAITS, anvilBaseName, orderTraders } from './changes/data';
import {
  buildRecipeRows,
  buildRecyclingRows,
  buildStashRows,
  buildTraderPrices,
  priceOfLine,
  type AnvilLabels,
} from './changes/build';

export interface ChangesTabProps {
  data: WhatsNewPageData;
}

interface TradeGroupProps {
  title: string;
  lines: WhatsNewTradeLine[];
  refOf: (slug: string) => ItemRef;
  priceOf: (line: WhatsNewTradeLine) => string;
}

function TradeGroup({ title, lines, refOf, priceOf }: TradeGroupProps) {
  if (lines.length === 0) return null;
  return (
    <div className="wn-changes__group">
      <h4 className="wn-changes__subhead">{title}</h4>
      <ItemGrid>
        {lines.map((line) => (
          <div className="wn-grid__cell" key={line.result}>
            <ItemTile item={refOf(line.result)} size={80} sublabel={priceOf(line)} />
          </div>
        ))}
      </ItemGrid>
    </div>
  );
}

export function ChangesTab({ data }: ChangesTabProps) {
  const { t, tm, formatNumber } = useLocale();
  const changes = data.whatsNew?.versions['frozen-trail']?.changes;
  const refOf = useMemo(() => (slug: string) => toItemRef(data.catalog, slug), [data.catalog]);

  const labels: AnvilLabels = {
    craft: t('whatsNew.changes.craft'),
    upgrade: (from, to) => tm('whatsNew.changes.upgrade', { from, to }),
    repair: (tier) => tm('whatsNew.changes.repair', { tier }),
  };
  const recipes = buildRecipeRows(changes, refOf, labels);
  const recycling = buildRecyclingRows(changes, refOf);
  const stash = buildStashRows(changes, refOf, formatNumber);
  const traders = orderTraders(changes?.traders);
  const [trader, setTrader] = useState<string>(traders[0]?.npc ?? '');
  const current = traders.find((x) => x.npc === trader) ?? traders[0];
  const traderName = (npc: string) => (data.trades ? nameOf(data.trades, npc, npc) : npc);
  const anvilName = anvilBaseName(refOf('anvil_i').name);
  const anvilCraft = recipes.anvil.filter((r) => !r.key.startsWith('anvil-repair'));
  const anvilRepair = recipes.anvil.filter((r) => r.key.startsWith('anvil-repair'));
  const scrapLabel = (value: string) => tm('whatsNew.changes.scrapValue', { value });
  const priceOf = (line: WhatsNewTradeLine) => priceOfLine(line, refOf, formatNumber, scrapLabel);

  return (
    <div className="wn-tab wn-tab-changes">
      <TabIntro title={t('whatsNew.intro.changes.title')} sentence={t('whatsNew.intro.changes.sentence')} />

      {recipes.others.length + recipes.anvil.length > 0 && (
        <PurposeGroup id="wn-changes-recipes" title={t('whatsNew.changes.recipes')} sentence={t('whatsNew.changes.recipesHint')} glyph="crafting" accent="#4fc3f7">
          {recipes.others.length > 0 && (
            <div className="wn-changes__group">
              <h4 className="wn-changes__subhead">{t('whatsNew.changes.gadgets')}</h4>
              <CompareRows rows={recipes.others} />
            </div>
          )}
          {anvilCraft.length > 0 && (
            <div className="wn-changes__group">
              <h4 className="wn-changes__subhead">{tm('whatsNew.changes.anvilCraft', { name: anvilName })}</h4>
              <CompareRows rows={anvilCraft} />
            </div>
          )}
          {anvilRepair.length > 0 && (
            <div className="wn-changes__group">
              <h4 className="wn-changes__subhead">{tm('whatsNew.changes.anvilRepair', { name: anvilName })}</h4>
              <CompareRows rows={anvilRepair} />
            </div>
          )}
        </PurposeGroup>
      )}

      {recycling.length > 0 && (
        <PurposeGroup id="wn-changes-recycling" title={t('whatsNew.changes.recycling')} sentence={t('whatsNew.changes.recyclingHint')} icon={<Recycle size={32} aria-hidden="true" />} accent="#26bf57">
          <CompareRows rows={recycling} />
        </PurposeGroup>
      )}

      {current && (
        <PurposeGroup id="wn-changes-traders" title={t('whatsNew.changes.traders')} sentence={t('whatsNew.changes.tradersHint')} glyph="trade" accent="#ffc600">
          <SegmentedControl
            ariaLabel={t('whatsNew.changes.traders')}
            value={current.npc}
            onChange={setTrader}
            options={traders.map((x) => ({ value: x.npc, label: traderName(x.npc), image: TRADER_PORTRAITS[x.npc] }))}
          />
          <TradeGroup title={t('whatsNew.changes.tradeNew')} lines={current.added ?? []} refOf={refOf} priceOf={priceOf} />
          <TradeGroup title={t('whatsNew.changes.tradeGone')} lines={current.removed ?? []} refOf={refOf} priceOf={priceOf} />
          {(current.priceChanged?.length ?? 0) > 0 && (
            <div className="wn-changes__group">
              <h4 className="wn-changes__subhead">{t('whatsNew.changes.tradePrice')}</h4>
              <CompareRows rows={buildTraderPrices(current.priceChanged, refOf)} />
            </div>
          )}
        </PurposeGroup>
      )}

      {stash.length > 0 && (
        <PurposeGroup id="wn-changes-stash" title={t('whatsNew.changes.stash')} sentence={t('whatsNew.changes.stashHint')} icon={<Package size={32} aria-hidden="true" />} accent="#cc3099">
          <div className="wn-stash" role="table">
            <div className="wn-stash__row wn-stash__row--head" role="row">
              <span role="columnheader">{t('whatsNew.changes.expansion')}</span>
              <span role="columnheader" className="wn-old">{t('whatsNew.common.before')}</span>
              <span role="columnheader"><NowLabel /></span>
            </div>
            {stash.map((row) => (
              <div className={`wn-stash__row${row.changed ? '' : ' wn-stash__row--same'}`} role="row" key={row.key}>
                <span role="cell" className="wn-stash__slots">{tm('whatsNew.changes.slotCount', { count: formatNumber(row.slots) })}</span>
                <span role="cell" className="wn-old">{row.isNew ? <span className="wn-stash__new">{t('whatsNew.changes.newTier')}</span> : row.before}</span>
                <span role="cell">{row.now}</span>
              </div>
            ))}
          </div>
        </PurposeGroup>
      )}
    </div>
  );
}
