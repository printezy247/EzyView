export interface FibLevel {
  /** 0 = anchor A price, 1 = anchor B price. */
  ratio: number;
  price: number;
  label: string;
}

const RETRACEMENT = [
  { ratio: 0, label: "0.0%" },
  { ratio: 0.236, label: "23.6%" },
  { ratio: 0.382, label: "38.2%" },
  { ratio: 0.5, label: "50.0%" },
  { ratio: 0.618, label: "61.8%" },
  { ratio: 0.786, label: "78.6%" },
  { ratio: 1, label: "100.0%" },
  { ratio: 1.618, label: "161.8%" },
  { ratio: 2.618, label: "261.8%" },
];

/** Linear interpolation between two anchor prices at each Fibonacci ratio. */
export function fibLevels(priceA: number, priceB: number, ratios: readonly { ratio: number; label: string }[] = RETRACEMENT): FibLevel[] {
  const delta = priceB - priceA;
  return ratios.map(({ ratio, label }) => ({ ratio, label, price: priceA + delta * ratio }));
}

export const FIB_RETRACEMENT_LEVELS = RETRACEMENT;
