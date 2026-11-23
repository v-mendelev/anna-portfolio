import type { PortfolioContent } from '../lib/portfolio';

/**
 * Content for Anna Shelenkova's portfolio.
 *
 * Facts from the brief: name, profession and the four services.
 * Everything else (projects, showreel, testimonials, contacts, bio) is a
 * clearly flagged placeholder until Anna provides real material.
 * Do not replace placeholders with invented clients, results or reviews.
 */
export const content: PortfolioContent = {
  person: {
    name: 'Анна Шеленкова',
    role: 'Видеограф',
    placeholderBio: true,
    bio: 'Здесь будет короткий рассказ Анны о себе: с чего началась съёмка, как она работает и что любит снимать. Текст появится после согласования.',
  },

  showreel: {
    title: 'Шоурил',
    placeholder: true,
  },

  services: [
    {
      id: 'production',
      title: 'Видеопроизводство',
      displayTitle: 'Видео­производство',
      summary: 'Ролик под ключ: идея, сценарий, съёмка и готовый монтаж.',
      includes: ['Идея и сценарий', 'Съёмка', 'Монтаж и цвет', 'Версии под площадки'],
    },
    {
      id: 'editing',
      title: 'Монтаж',
      summary: 'Собираю историю из вашего материала или из своей съёмки.',
      includes: ['Монтаж', 'Цветокоррекция', 'Звук и музыка', 'Титры'],
    },
    {
      id: 'voice',
      title: 'Озвучка',
      summary: 'Закадровый голос для роликов, презентаций и рекламы.',
      includes: ['Закадровый текст', 'Запись голоса', 'Сведение с видео'],
    },
    {
      id: 'travel',
      title: 'Съёмка путешествий',
      displayTitle: 'Съёмка путе­шествий',
      summary:
        'Новое направление: выездная съёмка мест, маршрутов и отелей для туристических компаний.',
      includes: ['Выездная съёмка', 'Отели и маршруты', 'Ролики для продаж туров'],
    },
  ],

  categories: [
    { id: 'travel', label: 'Путешествия' },
    { id: 'brand', label: 'Бренды' },
    { id: 'editing', label: 'Монтаж' },
    { id: 'voice', label: 'Озвучка' },
  ],

  projects: [
    // Lead frame is not a travel shoot: travel is a new direction (see HERO).
    {
      id: 'brand-film',
      title: 'Бренд-ролик',
      category: 'brand',
      roles: ['production', 'editing'],
      tone: { from: '#26122a', to: '#d46a6a', horizon: 68, sunX: 50, sunY: 52 },
      placeholder: true,
    },
    {
      id: 'coast',
      title: 'Ролик о побережье',
      category: 'travel',
      place: 'Побережье',
      roles: ['travel', 'production', 'editing'],
      tone: { from: '#0f3d4a', to: '#d9b98a', horizon: 62, sunX: 70, sunY: 34 },
      placeholder: true,
    },
    {
      id: 'event',
      title: 'Ролик с мероприятия',
      category: 'brand',
      roles: ['production', 'editing'],
      tone: { from: '#2b1d16', to: '#c9874f', horizon: 74, sunX: 24, sunY: 40 },
      placeholder: true,
    },
    {
      id: 'mountains',
      title: 'Горный маршрут',
      category: 'travel',
      place: 'Горы',
      roles: ['travel', 'editing', 'voice'],
      tone: { from: '#1d2633', to: '#a9b8c9', horizon: 44, sunX: 82, sunY: 18 },
      placeholder: true,
    },
    {
      id: 'recut',
      title: 'Монтаж из материала клиента',
      category: 'editing',
      roles: ['editing'],
      tone: { from: '#141c14', to: '#8fa66b', horizon: 52, sunX: 30, sunY: 22 },
      placeholder: true,
    },
    {
      id: 'voice-presentation',
      title: 'Озвучка презентации',
      category: 'voice',
      roles: ['voice'],
      tone: { from: '#1a1a2e', to: '#7a86c2', horizon: 80, sunX: 62, sunY: 46 },
      placeholder: true,
    },
  ],

  travel: {
    intro:
      'Я начинаю снимать видео для туроператоров, отелей и туристических мест. Готовых туристических проектов пока нет — ниже показано, как будет устроена работа.',
    steps: [
      { title: 'Бриф', text: 'Обсуждаем направление, аудиторию и где будет жить ролик.' },
      { title: 'План выезда', text: 'Маршрут, локации, время съёмки и список кадров.' },
      { title: 'Съёмка на месте', text: 'Снимаю места, людей и детали, ради которых едут.' },
      {
        title: 'Монтаж и голос',
        text: 'Собираю ролик, при необходимости добавляю закадровый текст.',
      },
    ],
    formats: ['Горизонтальный ролик', 'Вертикальные версии', 'Короткие нарезки'],
  },

  testimonials: [
    {
      id: 't1',
      quote: 'Здесь будет отзыв клиента — только реальный, с разрешения автора.',
      author: 'Имя клиента',
      company: 'Компания',
      placeholder: true,
    },
    {
      id: 't2',
      quote: 'Место для второго отзыва. Пока отзывов нет, блок остаётся заглушкой.',
      author: 'Имя клиента',
      company: 'Компания',
      placeholder: true,
    },
  ],

  contacts: [
    { id: 'telegram', label: 'Telegram', placeholder: true },
    { id: 'email', label: 'Почта', placeholder: true },
    { id: 'phone', label: 'Телефон', placeholder: true },
  ],
};

export function serviceTitle(id: string): string {
  return content.services.find((s) => s.id === id)?.title ?? id;
}

export function categoryLabel(id: string): string {
  return content.categories.find((c) => c.id === id)?.label ?? id;
}

/**
 * Hero positioning shared by all concepts: Anna is a videographer first
 * (filming, editing, voice-over); travel production is a new direction, not
 * her only specialisation and not yet backed by finished tourism projects.
 */
export const HERO = {
  lead: 'Видеограф. Снимаю, монтирую и озвучиваю видео: от съёмки до готового ролика с голосом.',
  next: 'Новое направление — видео о путешествиях.',
} as const;

/** Travel section heading: named as a direction in development. */
export const TRAVEL_HEADING = { main: 'Путешествия', sub: 'новое направление' } as const;

/**
 * Shown above the portfolio in every concept while projects are placeholders:
 * the demo projects are invented layout examples, not Anna's actual work.
 */
export const DEMO_WORK_NOTE =
  'Проекты ниже вымышлены и показывают только макет. Это не работы Анны: их заменят реальные, когда она пришлёт материалы.';

/** Label for each invented project (frames and captions). */
export const DEMO_PROJECT_LABEL = 'вымышленный проект';

/** Shared section anchors: identical ids in every concept (used by nav and tests). */
export const SECTIONS = [
  { id: 'showreel', label: 'Шоурил' },
  { id: 'work', label: 'Работы' },
  { id: 'services', label: 'Услуги' },
  { id: 'travel', label: 'Путешествия' },
  { id: 'about', label: 'Обо мне' },
  { id: 'reviews', label: 'Отзывы' },
  { id: 'contact', label: 'Контакты' },
] as const;
