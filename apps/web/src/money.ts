/** Cents for display. The exact estimate stays on the title for hover. */
export function formatUsd(amount: number): { text: string; title: string } {
  const title = `$${amount.toFixed(6)}`;
  if (!(amount > 0)) return { text: "$0.00", title };
  if (amount < 0.005) return { text: "<$0.01", title };
  return { text: `$${amount.toFixed(2)}`, title };
}
