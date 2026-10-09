import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ItemChip, RecipeRow, BeforeAfterRow, FlowStrip, GamePanel,
  VerdictBadge, Counter, SectionHeader, VERDICT_CORNER_CLASS,
} from '..';
import type { ItemRef } from '..';

const a: ItemRef = { id: 'a', name: 'Alpha', icon: '/a.webp', rarity: 'rare' };
const b: ItemRef = { id: 'b', name: 'Beta', icon: '/b.webp' };
const c: ItemRef = { id: 'c', name: 'Gamma', rarity: 'amplified' };
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('whats-new components', () => {
  it('ItemChip shows quantity, name, marker and alt text', () => {
    const out = html(<ItemChip item={a} quantity={4} showName marker="new" size="lg" />);
    expect(out).toContain('×4');
    expect(out).toContain('alt="Alpha"');
    expect(out).toContain('data-marker="new"');
    expect(out).toContain('wn-chip--lg');
    expect(html(<ItemChip item={a} quantity={1} />)).not.toContain('×1');
    expect(html(<ItemChip item={a} onClick={() => {}} />)).toContain('role="button"');
  });

  it('RecipeRow renders inputs, arrow, outputs and label', () => {
    const out = html(<RecipeRow inputs={[{ item: a, quantity: 2 }, { item: b }]} outputs={[{ item: c }]} label="Workbench" labelImage="/bench.webp" compact />);
    expect(out).toContain('Workbench');
    expect(out).toContain('/bench.webp');
    expect(out).toContain('→');
    expect(out).toContain('×2');
    expect(out).toContain('wn-recipe--compact');
  });

  it('BeforeAfterRow marks removed and added items', () => {
    const out = html(<BeforeAfterRow title={c} before={[{ item: a, quantity: 2 }, { item: b }]} after={[{ item: b }, { item: c, quantity: 3 }]} />);
    expect(out.match(/wn-ba__removed/g)).toHaveLength(1);
    expect(out.match(/wn-ba__added/g)).toHaveLength(1);
    expect(html(<BeforeAfterRow beforePrice="100" afterPrice="50" />)).toContain('50');
  });

  it('FlowStrip renders steps with arrows between them', () => {
    const out = html(<FlowStrip steps={[{ title: 'One', items: [{ item: a }] }, { image: '/x.webp', note: 'Then' }, { items: [{ item: b, quantity: 5 }] }]} />);
    expect(out.match(/wn-flow__arrow/g)).toHaveLength(2);
    expect(out).toContain('One');
    expect(out).toContain('Then');
    expect(out).toContain('×5');
  });

  it('GamePanel renders title, counter, lock and children', () => {
    const out = html(<GamePanel title="Chalet" counter="2/4" locked lockedReason="Needs level 3" backgroundImage="/r.webp"><span>child</span></GamePanel>);
    expect(out).toContain('Chalet');
    expect(out).toContain('2/4');
    expect(out).toContain('Needs level 3');
    expect(out).toContain('wn-panel--locked');
    expect(out).toContain('<svg');
    expect(out).toContain('child');
  });

  it('VerdictBadge renders each verdict, count and corner class', () => {
    for (const v of ['keep', 'optional', 'quest', 'sell'] as const) {
      expect(html(<VerdictBadge verdict={v} />)).toContain(`wn-verdict--${v}`);
    }
    const out = html(<VerdictBadge verdict="keep" label="Keep" count={6} corner />);
    expect(out).toContain('Keep');
    expect(out).toContain('6');
    expect(out).toContain(VERDICT_CORNER_CLASS);
  });

  it('Counter shows value/total and done state', () => {
    expect(html(<Counter label="Found" value={3} total={5} />)).toContain('3/5');
    expect(html(<Counter value={5} total={5} />)).toContain('wn-counter--done');
  });

  it('SectionHeader has anchor id, subtitle and right slot', () => {
    const out = html(<SectionHeader id="outpost" title="Outpost" subtitle="Rooms" right={<b>R</b>} />);
    expect(out).toContain('id="outpost"');
    expect(out).toContain('<h2');
    expect(out).toContain('Rooms');
    expect(out).toContain('<b>R</b>');
  });
});
