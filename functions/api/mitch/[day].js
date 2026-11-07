// GET  /api/mitch/<YYYY-MM-DD | today>  read one day's round
// POST /api/mitch/<YYYY-MM-DD | today>  submit { name, payload } to today's round
//
// A round is one Pacific-time day. Players are identified by an HttpOnly
// cookie holding a random id; the API only ever returns a hash of it, so one
// player cannot copy another's identity from the leaderboard.

import { questionFor } from '../../../mitch/questions.js';
import { parsePlay } from '../../../mitch/score.js';

const GAME = 'mitch';
const COOKIE = 'mitch_player';
const MAX_NAME = 40;
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

async function publicId(playerId) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(playerId));
  return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
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

async function roundView(db, day, today, playerId) {
  const { results } = await db
    .prepare('SELECT player_id, name, payload, created_at FROM rounds WHERE round_key = ? ORDER BY created_at')
    .bind(`${GAME}/${day}`)
    .all();
  const entries = await Promise.all(
    results.map(async (row) => ({
      id: await publicId(row.player_id),
      name: row.name,
      payload: JSON.parse(row.payload),
      createdAt: row.created_at,
    })),
  );
  const mineIndex = playerId ? results.findIndex((row) => row.player_id === playerId) : -1;
  const mine = mineIndex >= 0 ? entries[mineIndex] : null;
  const phase = day < today ? 'past' : 'open';
  return {
    round: day,
    today,
    phase,
    count: entries.length,
    mine,
    // Open rounds stay hidden until you have played; closed rounds are public.
    entries: phase === 'past' || mine ? entries : null,
  };
}

export async function onRequestGet({ request, env, params }) {
  const today = dayFormatter.format(new Date());
  const resolved = resolveDay(params.day, today);
  if (resolved.error) return resolved.error;
  return json(await roundView(env.DB, resolved.day, today, playerFromCookie(request)));
}

export async function onRequestPost({ request, env, params }) {
  const now = new Date();
  const today = dayFormatter.format(now);
  const resolved = resolveDay(params.day, today);
  if (resolved.error) return resolved.error;
  if (resolved.day !== today) return json({ error: 'This round is closed', today }, 409);

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

  const existing = playerFromCookie(request);
  const playerId = existing ?? crypto.randomUUID();
  const { meta } = await env.DB.prepare(
    'INSERT INTO rounds (round_key, player_id, name, payload, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
  )
    .bind(`${GAME}/${today}`, playerId, name, JSON.stringify(play), Math.floor(now.getTime() / 1000))
    .run();
  if (meta.changes === 0) return json({ error: 'You already played this round', today }, 409);

  const headers = {};
  if (!existing) {
    const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
    headers['set-cookie'] = `${COOKIE}=${playerId}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`;
  }
  return json(await roundView(env.DB, today, today, playerId), 200, headers);
}
