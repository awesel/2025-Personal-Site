// One question per Pacific-time day, in order from START. Shared by the page
// and the API (functions/api/mitch/[day].js), so both agree on each day.

/** Day 1, YYYY-MM-DD in Pacific time. */
export const START = '2026-11-06';

const SCHEDULE = [
  {
    question: 'Is Mitch McConnell dead?',
    options: ['Yes', 'No', 'Not sure'],
    images: [
      {
        src: '/mitch/images/mitch.jpg',
        alt: 'Close-up of Mitch McConnell in wire-rim glasses, mouth half open mid-sentence',
        credit: null,
      },
    ],
  },
  {
    question:
      'Would you rather get married to the love of your life, or receive $1B per year for the rest of your life but stay forever alone?',
    options: ['Marry the love of my life', '$1B a year, forever alone'],
    images: [
      {
        src: '/mitch/images/harkonnen.jpg',
        alt: 'Baron Harkonnen from Dune, bald and pale, sunk to his shoulders in a tub of glossy black goop',
        credit: null,
      },
    ],
  },
  {
    question: 'Do you want to live forever?',
    options: ['Yes', 'No'],
    images: [
      {
        src: '/mitch/images/live-forever.jpg',
        alt: 'A man in a striped nightcap and nightshirt and orange-tinted glasses holding a lit candle in a brass holder in the dark',
        credit: null,
      },
    ],
  },
  {
    question: 'Do you find opossums to be cute or scary?',
    options: ['Cute', 'Scary'],
    images: [
      {
        src: '/mitch/images/opossum.jpg',
        alt: 'A Virginia opossum at night hissing with its mouth wide open, showing a lot of sharp teeth',
        credit: {
          artist: 'PiccoloNamek (en.wikipedia)',
          license: 'CC BY-SA 3.0',
          source: 'https://commons.wikimedia.org/wiki/File:AwesomePossum-AmericanOpossum.jpg',
        },
      },
      {
        src: '/mitch/images/opossum-family.jpg',
        alt: 'A mother opossum on a log carrying eight babies on her back, with one more walking beside her',
        credit: null,
      },
    ],
  },
  {
    question: 'Pick which time period you think will involve the most FLOPs',
    options: ['0-2026', '2026-2050', '2050+'],
    images: [
      {
        src: '/mitch/images/jensen-and-alice.jpg',
        alt: 'Jensen Huang in a black T-shirt waving at a restaurant, with a smiling woman in a pink dress holding a glass of red wine behind him',
        credit: null,
      },
    ],
  },
  {
    question: 'Rate your intelligence compared to the average person',
    options: [
      'I am much more intelligent than the average person',
      'I am slightly more intelligent than the average person',
      'I am about as intelligent as the average person',
      'I am slightly less intelligent than the average person',
      'I am much less intelligent than the average person',
    ],
    images: [
      {
        src: '/mitch/images/jurgen-schmidhuber-time.jpg',
        alt: 'A spoof TIME Person of the Year cover, "The Architects of AI": Jürgen Schmidhuber in a white tank top holds up a steel beam over a city, with a row of tech executives sitting on it',
        credit: null,
      },
    ],
  },
  {
    question: 'I believe that cats...',
    options: [
      'Have goals and aspirations just like humans',
      'Have some goals or values, but perhaps not as deeply as humans do',
      'Exist aimlessly without meaning',
    ],
    images: [
      {
        src: '/mitch/images/cat-sandwich.jpg',
        alt: 'A wide-eyed tabby kitten with its head between two slices of white bread, captioned "mmm yumy samich"',
        credit: null,
      },
    ],
  },
];

function addDays(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export const QUESTIONS = SCHEDULE.map((q, i) => ({ ...q, date: addDays(START, i) }));

export function questionFor(date) {
  return QUESTIONS.find((q) => q.date === date) ?? null;
}

/** Days with a question that have already closed, newest first. */
export function pastQuestions(today) {
  return QUESTIONS.filter((q) => q.date < today).sort((a, b) => b.date.localeCompare(a.date));
}

export function nextQuestionDate(today) {
  return QUESTIONS.map((q) => q.date).filter((d) => d > today).sort()[0] ?? null;
}
