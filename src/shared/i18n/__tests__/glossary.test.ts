import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from '../config';
import { DOMAIN_GLOSSARY, getGlossaryTerm } from '../glossary';

describe('glossary', () => {
  it('has the English term for every entry and only supported locales', () => {
    for (const [id, entry] of Object.entries(DOMAIN_GLOSSARY)) {
      expect(entry.text.en, id).toBeTruthy();
      for (const locale of Object.keys(entry.text)) expect(SUPPORTED_LOCALES, `${id}: ${locale}`).toContain(locale);
    }
  });

  it('game terms are translated into every locale', () => {
    for (const [id, entry] of Object.entries(DOMAIN_GLOSSARY)) {
      if (!entry.source.startsWith('game:')) continue;
      for (const locale of SUPPORTED_LOCALES) expect(entry.text[locale], `${id}: ${locale}`).toBeTruthy();
    }
  });

  it('returns the game wording, falling back to English', () => {
    expect(getGlossaryTerm('researchStation', 'de')).toBe('Forschungsstation');
    expect(getGlossaryTerm('raid', 'ja')).toBe('Raid');
  });
});
