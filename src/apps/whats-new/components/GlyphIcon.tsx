import { glyphUrl, type GlyphName } from './glyphs';

export interface GlyphIconProps {
  name: GlyphName;
  /** Width and height in px. */
  size?: number;
  className?: string;
  /** Accessible label. Without it the glyph is decorative (aria-hidden). */
  title?: string;
}

/** A white game glyph drawn as a CSS mask, so it takes the colour of `currentColor`. */
export function GlyphIcon({ name, size = 32, className, title }: GlyphIconProps) {
  const url = `url("${glyphUrl(name)}")`;
  const classes = ['wn-glyph', className].filter(Boolean).join(' ');
  return (
    <span
      role="img"
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={classes}
      style={{
        width: size,
        height: size,
        maskImage: url,
        WebkitMaskImage: url,
      }}
    />
  );
}
