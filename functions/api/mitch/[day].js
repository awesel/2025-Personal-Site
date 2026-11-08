// GET  /api/mitch/<YYYY-MM-DD | today>  read one day's round
// POST /api/mitch/<YYYY-MM-DD | today>  submit { name, payload, turnstileToken } to today's round
//
// A round is one Pacific-time day. Players are identified by an HttpOnly
// cookie holding a random id; the API only ever returns a hash of it, so one
// player cannot copy another's identity from the leaderboard. While a round is
// open, other players' answers never leave the server: everyone gets names and
// scores only.

import { questionFor } from '../../../mitch/questions.js';
import { leaderboard, parsePlay, validEntries } from '../../../mitch/score.js';

const GAME = 'mitch';
const COOKIE = 'mitch_player';
const MAX_NAME = 40;
// Generous enough for several people sharing one campus IP.
const RATE_LIMIT = { attempts: 10, windowSeconds: 600 };
const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

function playerFromCookie(request) {
  const match = (request.headers.get('cookie') || '').match(/(?:^|;\s*)mitch_player=([0-9a-f-]{36})(?:;|$)/);
  return match ? match[1] : null;
}

async function sha256Hex(value, bytes = 8) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest).slice(0, bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Resolves the requested day, or returns the error response for it. */
function resolveDay(param, today) {
  const day = param === 'today' ? today : param;
  if (!DAY_SHAPE.test(day)) return { error: json({ error: 'Round must be a YYYY-MM-DD day' }, 400) };
  const question = questionFor(day);
  if (!question) return { error: json({ error: 'No question on that day', today }, 404) };
  if (day > today) return { error: json({ error: 'This round has not opened yet', today }, 403) };
  return { day, question };
}

async function roundView(db, day, question, today, playerId) {
  const { results } = await db
    .prepare('SELECT player_id, name, payload, created_at FROM rounds WHERE round_key = ? ORDER BY created_at')
    .bind(`${GAME}/${day}`)
    .all();
  const entries = await Promise.all(
    results.map(async (row) => ({
      id: await sha256Hex(row.player_id),
      name: row.name,
      payload: JSON.parse(row.payload),
      createdAt: row.created_at,
    })),
  );
  const mineIndex = playerId ? results.findIndex((row) => row.player_id === playerId) : -1;
  const mine = mineIndex >= 0 ? entries[mineIndex] : null;
  const phase = day < today ? 'past' : 'open';
  const view = { round: day, today, phase, count: entries.length, mine };

  // Closed rounds are public in full.
  if (phase === 'past') return { ...view, entries };
  const optionCount = question.options.length;
  const ranked = leaderboard(validEntries(entries, optionCount), optionCount);
  return { ...view, leaderboard: ranked.map((r) => ({ name: r.name, tvd: r.tvd, you: r.id === mine?.id })) };
}

/** Records this attempt and reports whether the caller's IP is over the limit. */
async function overRateLimit(db, request, now) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const ipHash = await sha256Hex(`${GAME}:${ip}`, 16);
  const since = now - RATE_LIMIT.windowSeconds;
  const [, , counted] = await db.batch([
    db.prepare('DELETE FROM submit_attempts WHERE attempted_at < ?').bind(since),
    db.prepare('INSERT INTO submit_attempts (ip_hash, attempted_at) VALUES (?, ?)').bind(ipHash, now),
    db.prepare('SELECT COUNT(*) AS n FROM submit_attempts WHERE ip_hash = ? AND attempted_at >= ?').bind(ipHash, since),
  ]);
  return counted.results[0].n > RATE_LIMIT.attempts;
}

async function passedTurnstile(env, token, request) {
  if (typeof token !== 'string' || !token) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET_KEY);
  form.append('response', token);
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) form.append('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const outcome = await response.json().catch(() => ({}));
  return outcome.success === true;
}

export async function onRequestGet({ request, env, params }) {
  const today = dayFormatter.format(new Date());
  const resolved = resolveDay(params.day, today);
  if (resolved.error) return resolved.error;
  return json(await roundView(env.DB, resolved.day, resolved.question, today, playerFromCookie(request)));
}

export async function onRequestPost({ request, env, params }) {
  const now = new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const today = dayFormatter.format(now);
  const resolved = resolveDay(params.day, today);
  if (resolved.error) return resolved.error;
  if (resolved.day !== today) return json({ error: 'This round is closed', today }, 409);

  if (await overRateLimit(env.DB, request, nowSeconds)) {
    return json({ error: 'Too many submissions from your network. Try again in a few minutes.' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400);
  }
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > MAX_NAME) return json({ error: `Name must be 1 to ${MAX_NAME} characters` }, 400);
  const play = parsePlay(body?.payload, resolved.question.options.length);
  if (!play) return json({ error: 'Invalid answer or guess' }, 400);
  if (!(await passedTurnstile(env, body?.turnstileToken, request))) {
    return json({ error: 'The human check failed. Please try again.' }, 403);
  }

  const existing = playerFromCookie(request);
  const playerId = existing ?? crypto.randomUUID();
  const { meta } = await env.DB.prepare(
    'INSERT INTO rounds (round_key, player_id, name, payload, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
  )
    .bind(`${GAME}/${today}`, playerId, name, JSON.stringify(play), nowSeconds)
    .run();
  if (meta.changes === 0) return json({ error: 'You already played this round', today }, 409);

  const headers = {};
  if (!existing) {
    const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
    headers['set-cookie'] = `${COOKIE}=${playerId}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`;
  }
  return json(await roundView(env.DB, today, resolved.question, today, playerId), 200, headers);
}
