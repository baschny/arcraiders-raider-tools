import { useMemo, useState } from 'react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { nameOf } from '../../../shared/gamedata/loader';
import type { WhatsNewTradeLine } from '../../../shared/gamedata/types';
import { CompareRows, ItemGrid, ItemTile, Panel, SegmentedControl, TabIntro } from '../components';
import type { ItemRef } from '../components';
import { toItemRef, type WhatsNewPageData } from '../hooks/useWhatsNewData';
import { TRADER_PORTRAITS, anvilBaseName, orderTraders } from '../legacy/sections/changes/data';
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
  const scrapLabel = (value: string) => tm('whatsNew.changes.scrapValue', { value });
  const priceOf = (line: WhatsNewTradeLine) => priceOfLine(line, refOf, formatNumber, scrapLabel);

  return (
    <div className="wn-tab wn-tab-changes">
      <TabIntro title={t('whatsNew.intro.changes.title')} sentence={t('whatsNew.intro.changes.sentence')} />

      {recipes.others.length + recipes.anvil.length > 0 && (
        <Panel title={t('whatsNew.changes.recipes')} description={t('whatsNew.changes.recipesHint')} className="wn-changes__recipes">
          {recipes.others.length > 0 && <CompareRows rows={recipes.others} />}
          {recipes.anvil.length > 0 && (
            <div className="wn-changes__group">
              <h4 className="wn-changes__subhead">{anvilName}</h4>
              <CompareRows rows={recipes.anvil} />
            </div>
          )}
        </Panel>
      )}

      {recycling.length > 0 && (
        <Panel title={t('whatsNew.changes.recycling')} description={t('whatsNew.changes.recyclingHint')} className="wn-changes__recycling">
          <CompareRows rows={recycling} />
        </Panel>
      )}

      {current && (
        <Panel title={t('whatsNew.changes.traders')} description={t('whatsNew.changes.tradersHint')} className="wn-changes__traders">
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
        </Panel>
      )}

      {stash.length > 0 && (
        <Panel title={t('whatsNew.changes.stash')} description={t('whatsNew.changes.stashHint')} className="wn-changes__stash">
          <div className="wn-stash" role="table">
            <div className="wn-stash__row wn-stash__row--head" role="row">
              <span role="columnheader">{t('whatsNew.changes.expansion')}</span>
              <span role="columnheader">{t('whatsNew.common.before')}</span>
              <span role="columnheader">{t('whatsNew.common.now')}</span>
            </div>
            {stash.map((row) => (
              <div className={`wn-stash__row${row.changed ? '' : ' wn-stash__row--same'}`} role="row" key={row.key}>
                <span role="cell" className="wn-stash__slots">{tm('whatsNew.changes.slotCount', { count: formatNumber(row.slots) })}</span>
                <span role="cell">{row.isNew ? <span className="wn-stash__new">{t('whatsNew.changes.newTier')}</span> : row.before}</span>
                <span role="cell">{row.now}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
