export function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Trailing mean over `window` points; null until the window is full, and while it holds an unknown (null) value. */
export function rollingMean(values: (number | null)[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  let acc = 0;
  let unknown = 0;
  for (let i = 0; i < values.length; i++) {
    const entering = values[i];
    if (entering === null) unknown++;
    else acc += entering;
    if (i >= window) {
      const leaving = values[i - window];
      if (leaving === null) unknown--;
      else acc -= leaving;
    }
    out.push(i >= window - 1 && unknown === 0 ? acc / window : null);
  }
  return out;
}

export function sumBy<T>(rows: T[], pick: (row: T) => number): number {
  return sum(rows.map(pick));
}
