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
    question: 'Is a hot dog a sandwich?',
    options: ['Yes', 'No', "It's a taco"],
    images: [
      {
        src: '/mitch/images/hotdog.jpg',
        alt: 'A hot dog in a toasted sesame bun with ketchup and a zigzag of yellow mustard',
        credit: {
          artist: 'Lim Tsze Kin 207073',
          license: 'CC BY-SA 4.0',
          source:
            'https://commons.wikimedia.org/wiki/File:HK_SW_Wing_Lok_Street_FWD_Financial_Centre_shop_Maxim%27s_MX_Restaurant_afternoon_meal_food_July_2020_SS2_05.jpg',
        },
      },
    ],
  },
  {
    question: 'Could you win a fight against an angry goose?',
    options: ['Yes, easily', 'It would be close', 'No, the goose wins'],
    images: [
      {
        src: '/mitch/images/goose.jpg',
        alt: 'A white farm goose seen from ground level, beak gaping wide as it hisses at the camera',
        credit: {
          artist: 'Trougnouf (Benoit Brummer)',
          license: 'CC BY-SA 4.0',
          source: 'https://commons.wikimedia.org/wiki/File:Angry_goose_(DSC_0780).jpg',
        },
      },
    ],
  },
  {
    question: 'Would you rather fight one horse-sized duck or 100 duck-sized horses?',
    options: ['One horse-sized duck', '100 duck-sized horses'],
    images: [
      {
        src: '/mitch/images/duck.jpg',
        alt: 'An Indian runner duck shoved right up to the lens, its blurry orange beak filling the frame',
        credit: {
          artist: 'Daisytheduck',
          license: 'CC BY-SA 4.0',
          source: 'https://commons.wikimedia.org/wiki/File:Indian_runner_duck_looking_at_a_camera.jpg',
        },
      },
    ],
  },
  {
    question: 'Is cereal a soup?',
    options: ['Yes', 'No'],
    images: [
      {
        src: '/mitch/images/cereal.jpg',
        alt: 'A glass bowl of rainbow Froot Loops with a spoon and milk',
        credit: {
          artist: 'Evan-Amos',
          license: 'CC0',
          source: 'https://commons.wikimedia.org/wiki/File:Froot-Loops-Cereal-Bowl.jpg',
        },
      },
    ],
  },
  {
    question: 'Does pineapple belong on pizza?',
    options: ['Yes', 'No'],
    images: [
      {
        src: '/mitch/images/pineapple-pizza.jpg',
        alt: 'Close-up of a thick-crust Hawaiian pizza topped with pineapple rings and ham',
        credit: {
          artist: '@joefoodie from USA',
          license: 'CC BY 2.0',
          source: 'https://commons.wikimedia.org/wiki/File:Hawaiian_pizza_1.jpg',
        },
      },
    ],
  },
  {
    question: 'Are birds real?',
    options: ['Yes', "No, they're government drones", 'Not sure'],
    images: [
      {
        src: '/mitch/images/pigeon.jpg',
        alt: 'Extreme close-up of a grey pigeon giving the camera a side-eye with one beady orange eye',
        credit: {
          artist: 'DemonTraitor',
          license: 'CC BY-SA 2.5',
          source: 'https://commons.wikimedia.org/wiki/File:Pigeon-close-up-on-head.jpg',
        },
      },
    ],
  },
  {
    question: 'Would you eat a bug for $1,000?',
    options: ['Yes', 'No'],
    images: [
      {
        src: '/mitch/images/bugs.jpg',
        alt: 'A Thai market stall with trays of fried silkworm pupae, bamboo worms, crickets and water bugs',
        credit: {
          artist: 'Jnpet',
          license: 'CC BY-SA 4.0',
          source: 'https://commons.wikimedia.org/wiki/File:Roasted_insects_Thailand.jpg',
        },
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
