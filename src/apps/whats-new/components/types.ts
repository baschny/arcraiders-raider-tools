export type ItemRef = { id: string; name: string; icon?: string; rarity?: string };
export type AmountRef = { item: ItemRef; quantity?: number };
export type ChipSize = 'sm' | 'md' | 'lg';
export type Verdict = 'keep' | 'optional' | 'quest' | 'sell';
