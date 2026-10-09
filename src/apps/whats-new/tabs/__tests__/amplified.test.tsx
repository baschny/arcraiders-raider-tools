import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import ampJson from '../../../../../public/data/game/amplification.json';
import benchesJson from '../../../../../public/data/game/benches.json';
import { LocaleProvider } from '../../../../shared/context/LocaleContext';
import { AmplifiedTab } from '../AmplifiedTab';
import { groupByModule } from '../amplified/model';
import type { WhatsNewPageData } from '../../hooks/useWhatsNewData';
import type { AmplificationStructure } from '../../../../shared/gamedata/types';

const catalog = { items: {}, aliases: {} };
const data = {
  catalog,
  amplification: { structure: ampJson },
  benches: { structure: benchesJson },
  whatsNew: null,
} as unknown as WhatsNewPageData;

describe('AmplifiedTab', () => {
  it('groups the 15 weapons by module', () => {
    const groups = groupByModule(ampJson as unknown as AmplificationStructure, catalog as never);
    expect(groups.reduce((n, g) => n + g.weapons.length, 0)).toBe(15);
  });

  it('renders steps, Gunsmith card, picker groups and a detail table for the first weapon', () => {
    const out = renderToStaticMarkup(
      <LocaleProvider>
        <MemoryRouter>
          <AmplifiedTab data={data} />
        </MemoryRouter>
      </LocaleProvider>,
    );
    expect(out).toContain('wn-how');
    expect(out).toContain('wn-needs');
    expect(out.match(/wn-amp__group"/g)).toHaveLength(5);
    expect(out.match(/wn-tile--80[^"]*is-selected/g)).toHaveLength(1);
    expect(out).toContain('wn-amp__table');
    expect(out).toContain('role="columnheader"');
    expect(out).toContain('rarity-amplified');
    expect(out).not.toContain('→');
  });
});
