import { Package, ScrollText, Rocket } from 'lucide-react';
import type { WhatsNewSystem } from '../../../../shared/gamedata/types';
import { ItemChip } from '../../components';
import type { ResolvedRef } from './refs';

/** Small icon for a resolved use target / via (item chip, bench tier, trader portrait, stash tier). */
export function RefIcon({ resolved, system }: { resolved: ResolvedRef; system?: WhatsNewSystem }) {
  switch (resolved.kind) {
    case 'item':
      return <ItemChip item={resolved.item} size="sm" />;
    case 'bench':
      return resolved.image ? (
        <img className="wn-ref wn-ref--bench" src={resolved.image} alt={resolved.label} title={resolved.label} loading="lazy" />
      ) : (
        <span className="wn-ref wn-ref--label">{resolved.label}</span>
      );
    case 'trader':
      return <img className="wn-ref wn-ref--trader" src={resolved.image} alt={resolved.label} title={resolved.label} loading="lazy" />;
    case 'stash':
      return (
        <span className="wn-ref wn-ref--stash" title={`${resolved.slots}`}>
          <Package size={14} aria-hidden="true" />
          {resolved.slots}
        </span>
      );
    default: {
      const Icon = system === 'project' ? Rocket : ScrollText;
      return (
        <span className="wn-ref wn-ref--label" title={resolved.label}>
          {system === 'quest' || system === 'project' ? <Icon size={16} aria-hidden="true" /> : resolved.label}
        </span>
      );
    }
  }
}
