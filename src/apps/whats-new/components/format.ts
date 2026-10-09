/** Number renders as "3×"; a string is shown as is ("50 RP"). */
export function formatAmount(amount: number | string): string {
  return typeof amount === 'number' ? `${amount}×` : amount;
}
