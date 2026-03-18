/**
 * Format a number as currency with space-separated thousands.
 * @param value - The numeric value to format
 * @param symbol - Currency symbol (default: "R")
 * @param decimals - Number of decimal places (default: 2)
 */
export function formatCurrency(
  value: number,
  symbol: string = "R",
  decimals: number = 2
): string {
  const isNegative = value < 0;
  const abs = Math.abs(value);
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  // Add spaces as thousand separators
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${isNegative ? "-" : ""}${symbol} ${formatted}.${decPart}`;
}
