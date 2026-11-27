import type { PortfolioContent } from '../lib/portfolio';

/**
 * Content of Anna Shelenkova's site — the only file to edit when material
 * changes (see "Замена контента" in README.md and docs/MEDIA.md).
 *
 * Facts from the brief: name, profession and the four services.
 * Showreel and portfolio: Anna's real videos from her Yandex Disk portfolio
 * (2026-11-27). Titles are neutral working titles; clients, roles and other
 * details Anna has not confirmed yet are flagged (`unconfirmed`) or left out.
 * Bio, portrait and contacts stay labelled placeholders. Never fill gaps with
 * invented clients, results, reviews or numbers.
 *
 * Media: keys relative to the media root (public/media/ or the CDN set in
 * PUBLIC_MEDIA_BASE_URL), built by `pnpm media:build`. A slot with `video`
 * renders a player, with only `poster` an image, with neither a labelled
 * placeholder (never an empty player).
 */
export const content: PortfolioContent = {
  person: {
    name: 'Анна Шеленкова',
    role: 'Видеограф',
    placeholderBio: true,
    bio: 'Здесь будет короткий рассказ Анны о себе: с чего началась съёмка, как она работает и что любит снимать. Текст появится после согласования.',
    // portrait: 'about/portrait.webp',
  },

  // Anna is a videographer first (filming, editing, voice-over); travel
  // production is a new direction, not yet backed by finished projects.
  hero: {
    lead: 'Видеограф. Снимаю, монтирую и озвучиваю видео: от съёмки до готового ролика с голосом.',
    next: 'Новое направление — видео о путешествиях.',
    // A frame from the showreel (0:04.5), cropped to 16:9.
    still: { poster: 'hero/still.webp', posterAvif: 'hero/still.avif' },
  },

  showreel: {
    title: 'Шоурил',
    description: 'Фрагменты разных работ в одном ролике.',
    placeholder: false,
    video: 'showreel/video.mp4',
    poster: 'showreel/poster.webp',
    durationLabel: '0:35',
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

  // Genres actually present in Anna's portfolio.
  categories: [
    { id: 'business', label: 'Эксперты и бизнес' },
    { id: 'events', label: 'Мероприятия' },
    { id: 'reels', label: 'Рилсы и сюжеты' },
  ],

  roles: [
    { id: 'filming', label: 'Съёмка' },
    { id: 'editing', label: 'Монтаж' },
  ],

  // Anna's real work. Roles come only from Anna's own file labels
  // ("съемка + монтаж", "монтаж"); where a file has none, roles stay empty
  // and the card says the role is being confirmed. Clients are not named
  // until Anna confirms they may be.
  projects: [
    {
      id: 'vizitka',
      title: 'Видео-визитка',
      category: 'business',
      roles: ['filming', 'editing'],
      orientation: 'vertical',
      duration: '1:33',
      video: 'work/vizitka/video.mp4',
      poster: 'work/vizitka/poster.webp',
      unconfirmed: true,
      placeholder: false,
    },
    {
      id: 'fashion',
      title: 'Ролик о моде',
      category: 'reels',
      roles: ['filming', 'editing'],
      orientation: 'vertical',
      duration: '0:26',
      video: 'work/fashion/video.mp4',
      poster: 'work/fashion/poster.webp',
      unconfirmed: true,
      placeholder: false,
    },
    {
      id: 'conference',
      title: 'Конференция',
      category: 'events',
      roles: ['filming', 'editing'],
      orientation: 'vertical',
      duration: '0:52',
      video: 'work/conference/video.mp4',
      poster: 'work/conference/poster.webp',
      unconfirmed: true,
      placeholder: false,
    },
    {
      id: 'corporate',
      title: 'Корпоратив',
      category: 'events',
      roles: [],
      orientation: 'vertical',
      duration: '0:32',
      video: 'work/corporate/video.mp4',
      poster: 'work/corporate/poster.webp',
      unconfirmed: true,
      placeholder: false,
    },
    {
      id: 'podcast',
      title: 'Интро подкаста',
      category: 'business',
      roles: ['editing'],
      orientation: 'horizontal',
      duration: '2:26',
      video: 'work/podcast/video.mp4',
      poster: 'work/podcast/poster.webp',
      unconfirmed: true,
      placeholder: false,
    },
    {
      id: 'stage-promo',
      title: 'Промо танцевального шоу',
      category: 'events',
      roles: [],
      orientation: 'horizontal',
      ratio: '16 / 10',
      duration: '1:03',
      video: 'work/stage-promo/video.mp4',
      poster: 'work/stage-promo/poster.webp',
      unconfirmed: true,
      placeholder: false,
    },
    {
      id: 'motorcycles',
      title: 'Сюжет «Мотобат»',
      category: 'reels',
      roles: ['filming', 'editing'],
      orientation: 'vertical',
      duration: '0:34',
      video: 'work/motorcycles/video.mp4',
      poster: 'work/motorcycles/poster.webp',
      unconfirmed: true,
      placeholder: false,
    },
    {
      id: 'dance-bw',
      title: 'Танцевальный ролик, ч/б',
      category: 'reels',
      roles: ['filming', 'editing'],
      orientation: 'vertical',
      duration: '0:48',
      video: 'work/dance-bw/video.mp4',
      poster: 'work/dance-bw/poster.webp',
      unconfirmed: true,
      placeholder: false,
    },
    {
      id: 'dance-reel',
      title: 'Танцевальный рилс',
      category: 'reels',
      roles: ['editing'],
      orientation: 'vertical',
      duration: '1:02',
      video: 'work/dance-reel/video.mp4',
      poster: 'work/dance-reel/poster.webp',
      unconfirmed: true,
      placeholder: false,
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

/** Label of a project role: a role ("Съёмка") or a service title. */
export function roleTitle(id: string): string {
  return content.roles?.find((r) => r.id === id)?.label ?? serviceTitle(id);
}

export function categoryLabel(id: string): string {
  return content.categories.find((c) => c.id === id)?.label ?? id;
}

/**
 * Shown above the portfolio while project details are unconfirmed: the work
 * is Anna's, the working titles and labels are not final.
 */
export const WORK_NOTE =
  'Все ролики — работы Анны. Названия рабочие: заказчиков и детали проектов Анна уточнит.';

/** Shown on a card whose roles Anna has not confirmed yet. */
export const ROLES_PENDING = 'Роль Анны уточняется';

/** Shown in the portfolio while it still holds invented placeholder projects. */
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
