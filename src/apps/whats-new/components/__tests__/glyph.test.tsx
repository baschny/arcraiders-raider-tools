import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GlyphIcon, GLYPH_NAMES, glyphUrl } from '..';

describe('GlyphIcon', () => {
  it('renders a decorative mask span by default', () => {
    const out = renderToStaticMarkup(<GlyphIcon name="outpost" />);
    expect(out).toContain('class="wn-glyph"');
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain('role="img"');
    expect(out).toContain('width:32px');
    expect(out).toContain('height:32px');
    expect(out).toContain('/images/whats-new/icons/outpost.webp');
  });

  it('uses size, className and title as an accessible image', () => {
    const out = renderToStaticMarkup(
      <GlyphIcon name="key" size={20} className="extra" title="Pendola keys" />,
    );
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="Pendola keys"');
    expect(out).not.toContain('aria-hidden');
    expect(out).toContain('class="wn-glyph extra"');
    expect(out).toContain('width:20px');
  });

  it('sets the mask image with and without the webkit prefix', () => {
    const out = renderToStaticMarkup(<GlyphIcon name="trade" />);
    expect(out).toContain('mask-image:url(&quot;/images/whats-new/icons/trade.webp&quot;)');
    expect(out).toContain('-webkit-mask-image:url(&quot;/images/whats-new/icons/trade.webp&quot;)');
  });

  it('exposes the 18 glyph names and their urls', () => {
    expect(GLYPH_NAMES).toHaveLength(18);
    expect(glyphUrl('beacon')).toBe('/images/whats-new/icons/beacon.webp');
  });
});
