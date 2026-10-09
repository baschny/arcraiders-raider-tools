import { nameOf } from '../../../../shared/gamedata/loader';
import type { WhatsNewPageData } from '../../hooks/useWhatsNewData';
import type { UnlockRef } from './data';

/** Localized bench name of an unlock ("Research Station"), separate from its level. */
export function unlockBenchName(data: WhatsNewPageData, unlock: UnlockRef): string {
  const bench = data.benches.structure.benches[unlock.benchId];
  return nameOf(data.benches, unlock.benchId, bench?.nameEn);
}

/** Order unlocks by bench name so every panel lists them the same way. */
export function sortUnlocks(data: WhatsNewPageData, unlocks: readonly UnlockRef[]): UnlockRef[] {
  return [...unlocks].sort(
    (a, b) => unlockBenchName(data, a).localeCompare(unlockBenchName(data, b)) || a.level - b.level,
  );
}
