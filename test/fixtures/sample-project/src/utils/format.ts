export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-");
}
