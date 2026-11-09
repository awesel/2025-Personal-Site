// Each player answers, then guesses how all players will answer. A guess is
// measured by total variation distance (TVD) against the actual split of every
// answer that day. Players see 100 × (1 − TVD): 100 is a perfect guess.

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

/** Answer shares (fractions) among `entries`. */
export function roomShares(entries, optionCount) {
  const counts = new Array(optionCount).fill(0);
  for (const entry of entries) counts[entry.play.answer] += 1;
  const n = entries.length;
  return { shares: n ? counts.map((c) => c / n) : counts, n };
}

export function guessShares(play) {
  const total = play.prediction.reduce((a, b) => a + b, 0) || 1;
  return play.prediction.map((p) => p / total);
}

/** A player's TVD against the day's actual split, or null if they did not play. */
export function playerTvd(entries, optionCount, id) {
  const me = entries.find((e) => e.id === id);
  return me ? tvd(guessShares(me.play), roomShares(entries, optionCount).shares) : null;
}

/** Everyone's score, best first; ties go to whoever played earlier. */
export function leaderboard(entries, optionCount) {
  const actual = roomShares(entries, optionCount).shares;
  return entries
    .map((entry) => ({ id: entry.id, name: entry.name, tvd: tvd(guessShares(entry.play), actual), createdAt: entry.createdAt }))
    .sort((a, b) => a.tvd - b.tvd || a.createdAt - b.createdAt);
}

export function score(tvdValue) {
  return Math.round((1 - tvdValue) * 100);
}
