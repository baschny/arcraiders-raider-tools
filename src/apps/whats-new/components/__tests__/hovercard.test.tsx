import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocaleProvider } from '../../../../shared/context/LocaleContext';
import { ItemHoverCard, ItemHoverCardBody, ItemTile } from '..';
import type { ItemRef, HoverSection } from '..';

const a: ItemRef = { id: 'a', name: 'Alpha', icon: '/a.webp', rarity: 'rare' };
const b: ItemRef = { id: 'b', name: 'Beta', icon: '/b.webp' };
const html = (el: React.ReactElement) => renderToStaticMarkup(<LocaleProvider>{el}</LocaleProvider>);

describe('ItemHoverCardBody', () => {
  it('renders header with name, subtitle and badges; no sections', () => {
    const out = html(<ItemHoverCardBody item={a} subtitle="Material · Rare" badges={['New']} sections={[]} />);
    expect(out).toContain('<h3>Alpha</h3>');
    expect(out).toContain('Material · Rare');
    expect(out).toContain('wn-hc__badge');
    expect(out).not.toContain('wn-hc__section');
    expect(out).not.toContain('wn-hc__header--divided');
  });

  it('renders sections, rows, details, amounts and the more line; skips empty sections', () => {
    const sections: HoverSection[] = [
      {
        key: 'unlocks',
        title: 'Unlocks',
        rows: [
          { key: 'r1', item: b, label: 'Beta', detail: 'Level 2 · 2,000 RP', amount: '3×', isBlueprint: true },
          { key: 'r2', image: '/bench.webp', label: 'Workbench' },
          { key: 'r3', glyph: <i className="g" />, label: 'Quest' },
        ],
        more: 4,
      },
      { key: 'empty', title: 'Nothing', rows: [] },
    ];
    const out = html(<ItemHoverCardBody item={a} sections={sections} />);
    expect(out).toContain('Unlocks');
    expect(out).not.toContain('Nothing');
    expect(out).toContain('Level 2 · 2,000 RP');
    expect(out).toContain('>3×<');
    expect(out).toContain('item-icon--blueprint');
    expect(out).toContain('src="/bench.webp"');
    expect(out).toContain('class="g"');
    expect(out).toContain('+4 more');
    expect(out).toContain('wn-hc__header--divided');
  });
});

describe('ItemHoverCard', () => {
  it('renders only the trigger while closed', () => {
    const out = html(
      <ItemHoverCard item={a} sections={[]}>
        <ItemTile item={a} size={64} />
      </ItemHoverCard>,
    );
    expect(out).toContain('wn-hc-trigger');
    expect(out).toContain('wn-tile--64');
    expect(out).not.toContain('role="tooltip"');
  });

  it('renders the bare trigger when disabled', () => {
    const out = html(
      <ItemHoverCard item={a} sections={[]} disabled>
        <ItemTile item={a} size={64} />
      </ItemHoverCard>,
    );
    expect(out).not.toContain('wn-hc-trigger');
  });
});
