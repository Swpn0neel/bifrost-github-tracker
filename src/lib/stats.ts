export function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Trailing mean over `window` points; null until the window is full. */
export function rollingMean(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  let acc = 0;
  for (let i = 0; i < values.length; i++) {
    acc += values[i];
    if (i >= window) acc -= values[i - window];
    out.push(i >= window - 1 ? acc / window : null);
  }
  return out;
}

export function sumBy<T>(rows: T[], pick: (row: T) => number): number {
  return sum(rows.map(pick));
}
