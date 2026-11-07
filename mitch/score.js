// Each player answers, then guesses how everyone else answered. A guess is
// measured by total variation distance (TVD) against the answers of every
// *other* player, so your own vote never helps your own guess. Players see
// 100 × (1 − TVD): 100 is a perfect guess.

/** A submission: { v: 1, answer, prediction }, prediction in whole percents summing to 100. */
export function parsePlay(payload, optionCount) {
  if (!payload || typeof payload !== 'object') return null;
  const { answer, prediction } = payload;
  if (!Number.isInteger(answer) || answer < 0 || answer >= optionCount) return null;
  if (!Array.isArray(prediction) || prediction.length !== optionCount) return null;
  if (!prediction.every((p) => typeof p === 'number' && Number.isFinite(p) && p >= 0)) return null;
  const total = prediction.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > 1) return null;
  return { v: 1, answer, prediction };
}

export function validEntries(entries, optionCount) {
  const out = [];
  for (const entry of entries) {
    const play = parsePlay(entry.payload, optionCount);
    if (play) out.push({ ...entry, play });
  }
  return out;
}

export function tvd(p, q) {
  let sum = 0;
  for (let i = 0; i < p.length; i += 1) sum += Math.abs((p[i] ?? 0) - (q[i] ?? 0));
  return sum / 2;
}

/** Answer shares (fractions) among `entries`, optionally leaving one player out. */
export function roomShares(entries, optionCount, excludeId) {
  const counts = new Array(optionCount).fill(0);
  let n = 0;
  for (const entry of entries) {
    if (excludeId && entry.id === excludeId) continue;
    counts[entry.play.answer] += 1;
    n += 1;
  }
  return { shares: n ? counts.map((c) => c / n) : counts, n };
}

export function guessShares(play) {
  const total = play.prediction.reduce((a, b) => a + b, 0) || 1;
  return play.prediction.map((p) => p / total);
}

/** A player's TVD against everyone else, or null while they are the only player. */
export function playerTvd(entries, optionCount, id) {
  const me = entries.find((e) => e.id === id);
  if (!me) return null;
  const others = roomShares(entries, optionCount, id);
  return others.n ? tvd(guessShares(me.play), others.shares) : null;
}

/** Everyone with a score, best first; ties go to whoever played earlier. */
export function leaderboard(entries, optionCount) {
  const ranked = [];
  for (const entry of entries) {
    const distance = playerTvd(entries, optionCount, entry.id);
    if (distance === null) continue;
    ranked.push({ id: entry.id, name: entry.name, tvd: distance, createdAt: entry.createdAt });
  }
  return ranked.sort((a, b) => a.tvd - b.tvd || a.createdAt - b.createdAt);
}

export function score(tvdValue) {
  return Math.round((1 - tvdValue) * 100);
}
