import { nextQuestionDate, pastQuestions, questionFor } from './questions.js';
import { guessShares, leaderboard, playerTvd, roomShares, score, validEntries } from './score.js';
import { evenSplit, setShare } from './split.js';

const API = '/api/mitch';
const NAME_KEY = 'mitch-name';
const LIVE_REFRESH_MS = 30_000;
const TURNSTILE_SITE_KEY = '0x4AAAAAAF34fCDGZI61BvGn';

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

function bar(share, striped = false, width = 120) {
  const px = Math.round(Math.min(1, Math.max(0, share)) * width);
  return px ? h('span', { className: striped ? 'bar striped' : 'bar', style: `width: ${px}px` }) : null;
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

let turnstileReady = null;

function loadTurnstile() {
  turnstileReady ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => reject(new Error('Could not load the human check.'));
    document.head.append(script);
  });
  return turnstileReady;
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

/** One row per answer, with a bar and percentage for each series side by side. */
function optionBars(options, series) {
  return h(
    'table',
    {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Answer'), series.map((s) => h('th', { colSpan: 2 }, s.label)))),
    h(
      'tbody',
      {},
      options.map((option, i) =>
        h(
          'tr',
          {},
          h('td', {}, option),
          series.flatMap((s) => [h('td', {}, bar(s.shares[i], s.striped)), h('td', { className: 'num' }, pct(s.shares[i]))]),
        ),
      ),
    ),
  );
}

function nameCell(name, isMe) {
  return isMe ? h('mark', {}, `${name} (you)`) : name;
}

const LEADERBOARD_SIZE = 10;

/** All rows, or the top rows plus the player's own row after a gap when they rank below them. */
function visibleRows(rows, showAll) {
  const ranked = rows.map((row, i) => ({ row, rank: i + 1 }));
  if (showAll) return ranked;
  const top = ranked.slice(0, LEADERBOARD_SIZE);
  const mine = ranked.find((item) => item.row.you);
  return mine && mine.rank > LEADERBOARD_SIZE ? [...top, null, mine] : top;
}

/** Today's leaderboard from the server: `{ name, tvd, you }` rows, best first. */
function leaderboardList(rows) {
  const list = h(
    'ol',
    {},
    visibleRows(rows, state.showAllLeaderboard).map((item) =>
      item
        ? h('li', { value: item.rank }, nameCell(item.row.name, item.row.you), `: ${score(item.row.tvd)}`)
        : h('li', { style: 'list-style: none' }, '...'),
    ),
  );
  if (rows.length <= LEADERBOARD_SIZE) return list;
  const toggle = h(
    'button',
    {
      type: 'button',
      onclick: () => {
        state.showAllLeaderboard = !state.showAllLeaderboard;
        renderBoard();
      },
    },
    state.showAllLeaderboard ? 'Show less' : 'Show more',
  );
  return [list, h('p', {}, toggle)];
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
  state.shares ??= evenSplit(question.options.length);
  let shares = state.shares;
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
        state.shares = shares;
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

  // Tokens are single-use, so every render of the form gets a fresh check.
  let turnstileToken = null;
  const check = h('div');
  const checkError = h('p');
  if (!submitting) {
    loadTurnstile()
      .then((turnstile) =>
        turnstile.render(check, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => {
            turnstileToken = token;
            checkError.textContent = '';
          },
          'expired-callback': () => {
            turnstileToken = null;
          },
        }),
      )
      .catch((err) => {
        checkError.textContent = `Error: ${err.message}`;
      });
  }

  const form = h(
    'form',
    {
      onsubmit: (e) => {
        e.preventDefault();
        const name = nameInput.value.trim();
        if (!name) return;
        if (!turnstileToken) {
          checkError.textContent = 'Please wait for the human check to finish.';
          return;
        }
        localStorage.setItem(NAME_KEY, name);
        onSubmit(name, shares, turnstileToken);
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
    check,
    checkError,
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

function todayResults(question, round) {
  const rows = round.leaderboard ?? [];
  const myPlay = validEntries([round.mine], question.options.length)[0]?.play;
  const myGuess = myPlay ? guessShares(myPlay) : null;

  return [
    rows.some((r) => r.you) ? null : h('p', {}, 'Your score appears once someone else has played.'),
    myPlay
      ? h(
          'p',
          {},
          'You answered ',
          h('i', {}, question.options[myPlay.answer]),
          ` and guessed ${question.options.map((o, i) => `${o} ${Math.round(myGuess[i] * 100)}%`).join(', ')}.`,
        )
      : null,
  ];
}

/** Today's leaderboard, shown to everyone, in its own section so expanding it leaves the form alone. */
function renderBoard() {
  const rows = state.round?.leaderboard ?? [];
  const played = !!state.round?.mine;
  $('board').replaceChildren(
    ...[
      rows.length ? [h('h3', {}, "Today's leaderboard"), leaderboardList(rows)] : null,
      played
        ? h(
            'p',
            { className: 'small' },
            `Scores change as more people play. The answers are revealed at midnight PT, in ${countdown()}.`,
          )
        : null,
    ]
      .flat(2)
      .filter(Boolean),
  );
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
  else {
    const winnerEntry = winner ? entries.find((e) => e.id === winner.id) : null;
    const series = [{ label: `Everyone (n=${room.n})`, shares: room.shares }];
    if (winnerEntry) series.push({ label: `${winner.name}'s guess`, shares: guessShares(winnerEntry.play), striped: true });
    body = [
      optionBars(question.options, series),
      winner ? h('p', {}, `Winner: ${winner.name}, ${score(winner.tvd)}.`) : null,
      mine !== null ? h('p', {}, `Your score: ${score(mine)}.`) : null,
    ];
  }

  return h(
    'div',
    {},
    h('img', { className: 'thumb', src: question.image, alt: question.imageAlt }),
    h('p', {}, h('b', {}, formatDay(question.date)), `: ${question.question}`),
    body,
  );
}

// --- state -----------------------------------------------------------------

const state = {
  today: null,
  round: null,
  answer: null,
  submitting: false,
  error: null,
  past: null,
  shares: null,
  showAllLeaderboard: false,
};

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
    panel.replaceChildren(...[todayResults(question, state.round)].flat(3).filter(Boolean));
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
          state.shares = null;
          state.error = null;
          renderPanel();
        },
        onSubmit: submit,
      }),
    );
  }
}

function renderFooter() {
  // Yesterday is always shown; older days sit in the Previous days dropdown.
  const [yesterday, ...older] = state.past ?? [];
  $('yesterday').hidden = !yesterday;
  $('yesterday-day').replaceChildren(...(yesterday ? [pastDayCard(yesterday.question, yesterday.round, myId())] : []));
  $('past').hidden = !older.length;
  $('past-days').replaceChildren(
    ...older.flatMap((d, i) => [i ? h('hr') : null, pastDayCard(d.question, d.round, myId())]).filter(Boolean),
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
  renderBoard();
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

async function submit(name, prediction, turnstileToken) {
  state.submitting = true;
  state.error = null;
  renderPanel();
  const result = await request(state.today, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, payload: { v: 1, answer: state.answer, prediction }, turnstileToken }),
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
