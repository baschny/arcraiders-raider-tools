/**
 * Format quest name for wiki link
 * Converts "quest name" to "Quest_Name"
 */
export function formatWikiLink(name: string): string {
  return name
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('_');
}

/**
 * Get CSS class for trader
 * Converts "Tian Wen" to "trader-tianwen"
 */
export function getTraderClass(trader: string): string {
  return `trader-${trader.toLowerCase().replace(' ', '')}`;
}
