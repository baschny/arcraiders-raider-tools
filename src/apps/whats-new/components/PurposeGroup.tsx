import type { CSSProperties, ReactNode } from 'react';
import { GlyphIcon } from './GlyphIcon';
import type { GlyphName } from './glyphs';

export interface PurposeGroupProps {
  title: string;
  /** One sentence explaining the group. */
  sentence?: string;
  /** Game glyph drawn on the tinted square ... */
  glyph?: GlyphName;
  /** ... or any other icon (e.g. a lucide icon). */
  icon?: ReactNode;
  /** Group accent colour: left stripe and square tint. */
  accent?: string;
  /** Draw the glyph on this background image instead of the plain tint (blueprints). */
  glyphBackground?: string;
  id?: string;
  children: ReactNode;
}

/** A group: full-width header band (accent stripe, 56 px tinted glyph square, title, sentence) and its content. */
export function PurposeGroup({ title, sentence, glyph, icon, accent, glyphBackground, id, children }: PurposeGroupProps) {
  const style = accent ? ({ '--wn-accent': accent } as CSSProperties) : undefined;
  const squareStyle = glyphBackground ? ({ backgroundImage: `url("${glyphBackground}")` } as CSSProperties) : undefined;
  return (
    <section className="wn-group" aria-labelledby={id ? `${id}-title` : undefined} id={id} style={style}>
      <header className="wn-group__head">
        {(glyph || icon) && (
          <span className={`wn-group__square${glyphBackground ? ' wn-group__square--bg' : ''}`} style={squareStyle}>
            {glyph ? <GlyphIcon name={glyph} size={32} /> : icon}
          </span>
        )}
        <div className="wn-group__text">
          <h3 className="wn-group__title" id={id ? `${id}-title` : undefined}>{title}</h3>
          {sentence && <p className="wn-group__sentence">{sentence}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}
