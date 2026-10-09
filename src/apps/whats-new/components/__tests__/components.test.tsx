import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../../../../shared/context/LocaleContext';
import {
  ItemTile, ItemGrid, DetailPanel, Panel, TabBar, TabIntro, HowItWorks, NeedsCard,
  CompareRows, PurposeGroup, SegmentedControl,
} from '..';
import type { ItemRef } from '..';

const a: ItemRef = { id: 'a', name: 'Alpha', icon: '/a.webp', rarity: 'rare' };
const b: ItemRef = { id: 'b', name: 'Beta', icon: '/b.webp' };
const c: ItemRef = { id: 'c', name: 'Gamma', rarity: 'amplified' };
const html = (el: React.ReactElement) =>
  renderToStaticMarkup(
    <LocaleProvider>
      <MemoryRouter>{el}</MemoryRouter>
    </LocaleProvider>,
  );

describe('whats-new components', () => {
  it('ItemTile renders size, name, amount and sublabel', () => {
    const out = html(<ItemTile item={a} size={80} amount={3} sublabel="2000 RP · L2" />);
    expect(out).toContain('wn-tile--80');
    expect(out).toContain('--item-icon-size:80px');
    expect(out).toContain('alt="Alpha"');
    expect(out).toContain('>3×<');
    expect(out).toContain('2000 RP · L2');
    expect(out).toContain('wn-tile__name');
    expect(out).not.toContain('<button');
  });

  it('ItemTile is a button when clickable and shows string amounts and selection', () => {
    const out = html(<ItemTile item={a} size={48} amount="50 RP" selected onClick={() => {}} />);
    expect(out).toContain('<button');
    expect(out).toContain('aria-pressed="true"');
    expect(out).toContain('is-selected');
    expect(out).toContain('50 RP');
    expect(html(<ItemTile item={a} size={64} hideName />)).not.toContain('wn-tile__name');
  });

  it('ItemGrid renders plain children and a selectable detail row', () => {
    expect(html(<ItemGrid><span>x</span></ItemGrid>)).toContain('class="wn-grid"');
    const items = [a, b, c];
    const out = html(
      <ItemGrid
        items={items}
        getKey={(i) => i.id}
        selectedKey="a"
        renderTile={(i, { selected, toggle }) => <ItemTile item={i} size={80} selected={selected} onClick={toggle} />}
        renderDetail={(i) => <p>Uses of {i.name}</p>}
      />,
    );
    expect(out.match(/wn-grid__cell/g)).toHaveLength(3);
    expect(out).toContain('wn-detail');
    expect(out).toContain('Uses of Alpha');
    expect(out).toContain('aria-label="Close"');
    expect(html(<ItemGrid items={items} getKey={(i) => i.id} renderTile={(i) => <ItemTile item={i} size={80} />} renderDetail={() => null} />)).not.toContain('wn-detail');
  });

  it('DetailPanel is a labelled region with a close button', () => {
    const out = html(<DetailPanel title="Alpha" onClose={() => {}} showTitle>body</DetailPanel>);
    expect(out).toContain('role="region"');
    expect(out).toContain('aria-label="Alpha"');
    expect(out).toContain('wn-detail__close');
    expect(out).toContain('body');
  });

  it('Panel renders title, aside and description', () => {
    const out = html(<Panel title="Station" aside="3/4" description="One sentence."><i>c</i></Panel>);
    expect(out).toContain('<h3 class="wn-panel__title">Station</h3>');
    expect(out).toContain('3/4');
    expect(out).toContain('One sentence.');
    expect(html(<Panel>only</Panel>)).not.toContain('wn-panel__head');
  });

  it('TabBar links every tab and marks the active one', () => {
    const out = html(<TabBar version="frozen-trail" active="outpost" />);
    expect(out.match(/wn-tabbar__tab/g)?.length).toBeGreaterThanOrEqual(7);
    expect(out).toContain('href="/whats-new/frozen-trail"');
    expect(out).toContain('href="/whats-new/frozen-trail/changes"');
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
    expect(out).toContain('Outpost');
  });

  it('TabIntro renders heading and sentence', () => {
    const out = html(<TabIntro title="Q?" sentence="Answer." />);
    expect(out).toContain('<h2 class="wn-intro__title">Q?</h2>');
    expect(out).toContain('Answer.');
  });

  it('HowItWorks numbers its steps and shows item or image', () => {
    const out = html(<HowItWorks steps={[{ item: a, text: 'Collect' }, { image: '/bench.webp', text: 'Expand' }]} />);
    expect(out.match(/wn-how__step"/g)).toHaveLength(2);
    expect(out).toContain('>1<');
    expect(out).toContain('>2<');
    expect(out).toContain('/bench.webp');
    expect(out).toContain('How it works');
  });

  it('NeedsCard shows result, where, needs and also-needs', () => {
    const out = html(
      <NeedsCard
        result={{ item: c }}
        where={{ image: '/bench.webp', label: 'Gunsmith level 4' }}
        needs={[{ item: a, amount: 3 }, { item: b, amount: 1 }]}
        alsoNeeds={[{ item: b, isBlueprint: true }]}
      />,
    );
    expect(out).toContain('wn-tile--112');
    expect(out).toContain('<h4 class="wn-needs__name">Gamma</h4>');
    expect(out).toContain('Where');
    expect(out).toContain('Gunsmith level 4');
    expect(out).toContain('Needs');
    expect(out.match(/wn-tile--64/g)).toHaveLength(2);
    expect(out).toContain('Also needs');
    expect(out.match(/wn-tile--48/g)).toHaveLength(1);
    expect(html(<NeedsCard result={{ item: c }} needs={[{ item: a }]} />)).not.toContain('Also needs');
  });

  it('CompareRows marks removed rows and costs, added costs and empty sides', () => {
    const out = html(
      <CompareRows
        rows={[
          { key: '1', item: { item: c }, before: [{ item: a, amount: 2, state: 'removed' }], now: [{ item: b, amount: 3, state: 'added' }] },
          { key: '2', item: { item: a }, before: [{ item: b }], now: [], status: 'removed', nowText: 'Removed' },
        ]}
      />,
    );
    expect(out).toContain('Before 2.0');
    expect(out).toContain('Frozen Trail');
    expect(out).toContain('wn-compare__row--removed');
    expect(out).toContain('wn-compare__cost--added');
    expect(out).toContain('wn-compare__cost--removed');
    expect(out).toContain('Removed');
    expect(html(<CompareRows rows={[{ key: 'x', item: { item: a }, before: [], now: [{ item: b }], status: 'added' }]} />)).toContain('—');
  });

  it('PurposeGroup shows glyph square, title, sentence, accent and children', () => {
    const out = html(<PurposeGroup id="g" title="Gunsmith level 4" sentence="Needed for the level." glyph="gunsmith" accent="#ef6c00"><b>kids</b></PurposeGroup>);
    expect(out).toContain('Gunsmith level 4');
    expect(out).toContain('Needed for the level.');
    expect(out).toContain('/images/whats-new/icons/gunsmith.webp');
    expect(out).toContain('--wn-accent:#ef6c00');
    expect(out).toContain('kids');
    expect(html(<PurposeGroup title="T" glyph="blueprint" glyphBackground="/bg.png">k</PurposeGroup>)).toContain('wn-group__square--bg');
    expect(html(<PurposeGroup title="T" icon={<i className="ic" />}>k</PurposeGroup>)).toContain('class="ic"');
  });

  it('SegmentedControl is a radiogroup with one checked option', () => {
    const out = html(
      <SegmentedControl ariaLabel="Trader" value="b" onChange={() => {}} options={[{ value: 'a', label: 'Celeste', image: '/c.webp' }, { value: 'b', label: 'Shani' }]} />,
    );
    expect(out).toContain('role="radiogroup"');
    expect(out).toContain('aria-label="Trader"');
    expect(out.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(out).toContain('/c.webp');
    expect(out).toContain('tabindex="-1"');
  });
});
