import { nextQuestionDate, pastQuestions, questionFor } from './questions.js';
import { guessShares, leaderboard, playerTvd, roomShares, score, validEntries } from './score.js';
import { evenSplit, setShare } from './split.js';

const API = '/api/mitch';
const NAME_KEY = 'mitch-name';
const LIVE_REFRESH_MS = 30_000;

const $ = (id) => document.getElementById(id);

/** Builds an element; strings become text nodes, so player names are never parsed as HTML. */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key in el && key !== 'list') el[key] = value;
    else el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

function formatDay(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function bar(share, width = 160) {
  return h('span', { className: 'bar', style: `width: ${Math.round(Math.min(1, Math.max(0, share)) * width)}px` });
}

function pct(share) {
  return `${Math.round(share * 100)}%`;
}

function countdown() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const left = 24 * 60 - (Number(parts.hour) * 60 + Number(parts.minute));
  const hours = Math.floor(left / 60);
  return hours ? `${hours}h ${left % 60}m` : `${left % 60}m`;
}

async function request(day, init) {
  try {
    const response = await fetch(`${API}/${day}`, { cache: 'no-store', ...init });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  } catch {
    return { ok: false, status: 0, body: { error: 'Could not reach the server.' } };
  }
}

// --- rendering -------------------------------------------------------------

function dayImage(question) {
  const { credit } = question;
  return h(
    'figure',
    {},
    h('img', { className: 'photo', src: question.image, alt: question.imageAlt }),
    credit
      ? h(
          'figcaption',
          { className: 'small' },
          'Photo: ',
          h('a', { href: credit.source, target: '_blank', rel: 'noreferrer' }, credit.artist),
          `, ${credit.license}`,
        )
      : null,
  );
}

function optionBars(options, label, shares) {
  return h(
    'table',
    {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Answer'), h('th', {}, label), h('th', {}))),
    h(
      'tbody',
      {},
      options.map((option, i) =>
        h('tr', {}, h('td', {}, option), h('td', {}, bar(shares[i])), h('td', { className: 'num' }, pct(shares[i]))),
      ),
    ),
  );
}

function nameCell(row, myId) {
  return row.id === myId ? h('mark', {}, `${row.name} (you)`) : row.name;
}

const LEADERBOARD_SIZE = 10;

/** The top rows, plus the player's own row after a gap when they rank below them. */
function visibleRows(rows, myId) {
  const top = rows.slice(0, LEADERBOARD_SIZE).map((row, i) => ({ row, rank: i + 1 }));
  const myRank = rows.findIndex((r) => r.id === myId);
  return myRank >= LEADERBOARD_SIZE ? [...top, null, { row: rows[myRank], rank: myRank + 1 }] : top;
}

function leaderboardList(rows, myId) {
  return h(
    'ol',
    {},
    visibleRows(rows, myId).map((item) =>
      item
        ? h('li', { value: item.rank }, nameCell(item.row, myId), `: ${score(item.row.tvd)}`)
        : h('li', { style: 'list-style: none' }, '...'),
    ),
  );
}

function answerPicker(question, onPick) {
  return [
    h('p', {}, h('b', {}, 'Step 1 of 2.'), ' What is your answer?'),
    h(
      'p',
      {},
      question.options.map((option, i) => h('button', { type: 'button', onclick: () => onPick(i) }, option)),
    ),
  ];
}

function guessForm(question, answer, { onBack, onSubmit, error, submitting }) {
  let shares = evenSplit(question.options.length);
  const sliders = [];
  const labels = [];

  const refresh = () =>
    shares.forEach((share, i) => {
      sliders[i].value = share;
      labels[i].textContent = `${share}%`;
    });

  const rows = question.options.map((option, i) => {
    sliders[i] = h('input', {
      type: 'range',
      min: 0,
      max: 100,
      step: 1,
      'aria-label': `Share who answer ${option}`,
      oninput: (e) => {
        shares = setShare(shares, i, Number(e.target.value));
        refresh();
      },
    });
    labels[i] = h('td', { className: 'num' });
    return h('tr', {}, h('td', {}, option), h('td', {}, sliders[i]), labels[i]);
  });
  refresh();

  const nameInput = h('input', {
    type: 'text',
    maxLength: 40,
    required: true,
    value: localStorage.getItem(NAME_KEY) ?? '',
    'aria-label': 'Your name',
  });

  const form = h(
    'form',
    {
      onsubmit: (e) => {
        e.preventDefault();
        const name = nameInput.value.trim();
        if (!name) return;
        localStorage.setItem(NAME_KEY, name);
        onSubmit(name, shares);
      },
    },
    h(
      'p',
      {},
      h('b', {}, 'Step 2 of 2.'),
      ' You answered ',
      h('i', {}, question.options[answer]),
      '. Guess what share of the other players will give each answer. The sliders always add up to 100.',
    ),
    h('table', {}, h('tbody', {}, rows)),
    h('p', {}, h('label', {}, 'Name on the leaderboard: ', nameInput)),
    error ? h('p', {}, `Error: ${error}`) : null,
    h(
      'p',
      {},
      h('button', { type: 'submit', disabled: submitting }, submitting ? 'Submitting...' : 'Submit'),
      h('button', { type: 'button', disabled: submitting, onclick: onBack }, 'Change my answer'),
    ),
    h('p', { className: 'small' }, 'One guess per day.'),
  );
  return form;
}

function todayResults(question, entries, myId) {
  const me = entries.find((e) => e.id === myId);
  const rows = leaderboard(entries, question.options.length);
  const myGuess = me ? guessShares(me.play) : null;

  return [
    rows.some((r) => r.id === myId) ? null : h('p', {}, 'Your score appears once someone else has played.'),
    me
      ? h(
          'p',
          {},
          'You answered ',
          h('i', {}, question.options[me.play.answer]),
          ` and guessed ${question.options.map((o, i) => `${o} ${Math.round(myGuess[i] * 100)}%`).join(', ')}.`,
        )
      : null,
    rows.length ? [h('h3', {}, "Today's leaderboard"), leaderboardList(rows, myId)] : null,
    h(
      'p',
      { className: 'small' },
      `Scores change as more people play. The answers are revealed at midnight PT, in ${countdown()}.`,
    ),
  ];
}

function pastDayCard(question, round, myId) {
  const n = question.options.length;
  const entries = validEntries(round?.entries ?? [], n);
  const room = roomShares(entries, n);
  const winner = leaderboard(entries, n)[0];
  const mine = myId ? playerTvd(entries, n, myId) : null;

  let body;
  if (!round) body = h('p', {}, 'Could not load this day.');
  else if (room.n === 0) body = h('p', {}, 'Nobody played.');
  else
    body = [
      optionBars(question.options, `Everyone (n=${room.n})`, room.shares),
      h(
        'p',
        {},
        winner ? `Winner: ${winner.name}, ${score(winner.tvd)}.` : '',
        mine !== null ? ` Your score: ${score(mine)}.` : '',
      ),
    ];

  return h(
    'div',
    {},
    h('img', { className: 'thumb', src: question.image, alt: question.imageAlt }),
    h('p', {}, h('b', {}, formatDay(question.date)), `: ${question.question} (${room.n} ${room.n === 1 ? 'player' : 'players'})`),
    body,
  );
}

// --- state -----------------------------------------------------------------

const state = { today: null, round: null, answer: null, submitting: false, error: null, past: null };

/** The player's public id, from today's round or any past round they played. */
function myId() {
  return state.round?.mine?.id ?? state.past?.find((d) => d.round?.mine)?.round.mine.id ?? null;
}

function renderPanel() {
  const question = state.today ? questionFor(state.today) : null;
  const panel = $('panel');
  if (!question) {
    const next = state.today ? nextQuestionDate(state.today) : null;
    panel.replaceChildren(h('p', {}, next ? `The next question is on ${formatDay(next)}.` : 'There is no question today.'));
    return;
  }
  if (state.round.mine) {
    panel.replaceChildren(...[todayResults(question, validEntries(state.round.entries ?? [], question.options.length), myId())].flat(3).filter(Boolean));
  } else if (state.answer === null) {
    panel.replaceChildren(
      ...answerPicker(question, (i) => {
        state.answer = i;
        renderPanel();
      }),
    );
  } else {
    panel.replaceChildren(
      guessForm(question, state.answer, {
        error: state.error,
        submitting: state.submitting,
        onBack: () => {
          state.answer = null;
          state.error = null;
          renderPanel();
        },
        onSubmit: submit,
      }),
    );
  }
}

function renderFooter() {
  const past = state.past ?? [];
  $('past').hidden = !past.length;
  $('past-days').replaceChildren(
    ...past.flatMap((d, i) => [i ? h('hr') : null, pastDayCard(d.question, d.round, myId())]).filter(Boolean),
  );
  const count = state.round?.count;
  $('status').textContent = state.today
    ? `${formatDay(state.today)}.${count === undefined ? '' : ` ${count} ${count === 1 ? 'person has' : 'people have'} played today.`}`
    : '';
}

function renderQuestion() {
  const question = state.today ? questionFor(state.today) : null;
  $('question').textContent = question ? `Today's question: ${question.question}` : 'No question today.';
  $('image').replaceChildren(...(question ? [dayImage(question)] : []));
}

function render() {
  renderQuestion();
  renderPanel();
  renderFooter();
}

async function loadToday() {
  const result = await request('today');
  if (result.status === 404 && result.body.today) {
    state.today = result.body.today;
    state.round = null;
  } else if (!result.ok) {
    $('panel').replaceChildren(h('p', {}, `Error: ${result.body.error ?? `Request failed (${result.status})`}`));
    return false;
  } else {
    state.today = result.body.today;
    state.round = result.body;
  }
  return true;
}

async function loadPast() {
  state.past = await Promise.all(
    pastQuestions(state.today).map(async (question) => {
      const result = await request(question.date);
      return { question, round: result.ok ? result.body : null };
    }),
  );
}

async function submit(name, prediction) {
  state.submitting = true;
  state.error = null;
  renderPanel();
  const result = await request(state.today, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, payload: { v: 1, answer: state.answer, prediction } }),
  });
  state.submitting = false;
  if (result.ok) {
    state.round = result.body;
  } else if (result.status === 409) {
    // Already played in another tab, or midnight passed while guessing.
    await loadToday();
    state.error = result.body.error === 'This round is closed' ? 'That round closed at midnight PT.' : null;
  } else {
    state.error = result.body.error ?? `Request failed (${result.status})`;
  }
  render();
}

async function start() {
  if (!(await loadToday())) return;
  render();
  await loadPast();
  renderFooter();
  setInterval(async () => {
    if (!state.round?.mine) return;
    if (await loadToday()) render();
  }, LIVE_REFRESH_MS);
}

start();
