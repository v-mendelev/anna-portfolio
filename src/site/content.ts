import type { PortfolioContent } from '../lib/portfolio';

/**
 * Content of Anna Shelenkova's site — the only file to edit when real
 * material arrives (see "Замена контента" in README.md).
 *
 * Facts from the brief: name, profession and the four services.
 * Everything else (projects, showreel, portrait, bio, contacts) is a clearly
 * flagged placeholder until Anna provides real material. Do not replace
 * placeholders with invented clients, results, reviews or numbers.
 *
 * Media: put files in `public/media/` and reference them as "/media/<file>".
 * A slot with `video` renders a player, with only `poster` an image, with
 * neither a labelled placeholder (never an empty player).
 */
export const content: PortfolioContent = {
  person: {
    name: 'Анна Шеленкова',
    role: 'Видеограф',
    placeholderBio: true,
    bio: 'Здесь будет короткий рассказ Анны о себе: с чего началась съёмка, как она работает и что любит снимать. Текст появится после согласования.',
    // portrait: '/media/anna.jpg',
  },

  // Anna is a videographer first (filming, editing, voice-over); travel
  // production is a new direction, not yet backed by finished projects.
  hero: {
    lead: 'Видеограф. Снимаю, монтирую и озвучиваю видео: от съёмки до готового ролика с голосом.',
    next: 'Новое направление — видео о путешествиях.',
    // still: { poster: '/media/hero.jpg' },
  },

  showreel: {
    title: 'Шоурил',
    description: 'Лучшие кадры из разных проектов в одном ролике: съёмка, монтаж и голос.',
    placeholder: true,
    // video: '/media/showreel.mp4',
    // poster: '/media/showreel.jpg',
    // durationLabel: '1:30',
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
    { id: 'brand', label: 'Бренды' },
    { id: 'travel', label: 'Путешествия' },
    { id: 'editing', label: 'Монтаж' },
    { id: 'voice', label: 'Озвучка' },
  ],

  // Invented layout examples (placeholder: true), NOT Anna's work. Replace each
  // with a real project: title, category, roles, and `video` and/or `poster`.
  projects: [
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

  // Contacts render as links only once `href` (and `value`) are filled in.
  contacts: [
    { id: 'telegram', label: 'Telegram', placeholder: true },
    { id: 'email', label: 'Почта', placeholder: true },
    { id: 'phone', label: 'Телефон', placeholder: true },
    { id: 'youdo', label: 'Профиль на YouDo', placeholder: true },
  ],
};

export function serviceTitle(id: string): string {
  return content.services.find((s) => s.id === id)?.title ?? id;
}

export function categoryLabel(id: string): string {
  return content.categories.find((c) => c.id === id)?.label ?? id;
}

/**
 * Shown above the portfolio while projects are placeholders: the projects are
 * invented layout examples, not Anna's actual work.
 */
export const DEMO_WORK_NOTE =
  'Проекты ниже вымышлены и показывают только макет. Это не работы Анны: их заменят реальные, когда она пришлёт материалы.';

/** Label for each invented project. */
export const DEMO_PROJECT_LABEL = 'вымышленный проект';

/** Page sections, in order: anchors for the header, the phone menu and tests. */
export const SECTIONS = [
  { id: 'showreel', label: 'Шоурил' },
  { id: 'work', label: 'Работы' },
  { id: 'services', label: 'Услуги' },
  { id: 'about', label: 'Обо мне' },
  { id: 'contact', label: 'Контакты' },
] as const;
