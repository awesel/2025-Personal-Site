// The guess sliders always sum to 100. Moving one slider spreads the change
// over the others in proportion to their current size.

export function evenSplit(count) {
  return roundToHundred(new Array(count).fill(100 / count));
}

export function setShare(shares, index, value) {
  const target = Math.min(100, Math.max(0, value));
  const othersTotal = shares.reduce((sum, s, i) => (i === index ? sum : sum + s), 0);
  const remaining = 100 - target;
  const next = shares.map((s, i) => {
    if (i === index) return target;
    if (othersTotal <= 0) return remaining / (shares.length - 1);
    return (s / othersTotal) * remaining;
  });
  return roundToHundred(next);
}

/** Whole numbers that sum to exactly 100 (largest remainder). */
export function roundToHundred(values) {
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const scaled = values.map((v) => (v / total) * 100);
  const floors = scaled.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = scaled.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}
