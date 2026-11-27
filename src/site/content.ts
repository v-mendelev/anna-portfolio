import type { PortfolioContent } from '../lib/portfolio';

/**
 * Content of Anna Shelenkova's site — the only file to edit when material
 * changes (see "Замена контента" in README.md and docs/MEDIA.md).
 *
 * Facts from the brief: name, profession and the four services.
 * Showreel and portfolio: Anna's real videos from her Yandex Disk portfolio
 * (2026-11-27). Titles are neutral; details Anna has not confirmed are not
 * shown (`unconfirmed` projects list only what is known; open questions are
 * in docs/CONTENT-REVIEW.md).
 * Portrait, biography and reviews: from Anna's previous site,
 * annashelenkova.ru (2026-11-27). Contacts: confirmed by Anna.
 * The YouDo profile link is still missing and stays a labelled placeholder.
 * Never fill gaps with invented clients, results, reviews or numbers.
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
    placeholderBio: false,
    // From the «Обо мне» and «Озвучка» blocks of annashelenkova.ru, shortened.
    // Time-sensitive statements are phrased without "сейчас".
    bio: [
      'Меня зовут Анна Шеленкова. Я видеомонтажёр и рилсмейкер: снимаю, монтирую и озвучиваю видео. Люблю сложные и творческие задачи и помогаю брендам обрести свой визуальный голос.',
      'Среди моих заказчиков — петербургская школа танцев IDC.',
      'В моём портфолио — промо для крупных площадок (VK Stadium, AGUUTEENS FEST), видео-визитки для участников телешоу «Большие и маленькие» на канале «Россия К» и контент для соцсетей IDC.',
      'До этого работала в пресс-службе Склифа: снимала и монтировала операции, клинические случаи и развлекательные видео для соцсетей института. С января 2026 года — фрилансер: монтирую контент для предпринимателей, психологов и ивент-компаний.',
      'Часто ко мне приходят без чёткого понимания, каким должно быть видео. Тогда я забираю «сырой» материал, продумываю концепцию и делаю так, чтобы результат оказался лучше, чем ожидал заказчик.',
      'В 2025 году окончила курс «Актёр закадрового озвучания и дубляжа» под руководством Станислава Стрелкова.',
      'Работаю с бизнесом и агентствами, где ценят чёткие сроки, профессиональный подход и ответственность с обеих сторон.',
    ],
    // Black-and-white portrait from annashelenkova.ru, 2:3, not cropped.
    portrait: 'about/portrait.webp',
    portraitAvif: 'about/portrait.avif',
    portraitAlt: 'Анна Шеленкова, чёрно-белый портрет у окна',
  },

  // Anna is a videographer first (filming, editing, voice-over); travel
  // production is a new direction, not yet backed by finished projects.
  hero: {
    lead: 'Видеограф. Снимаю, монтирую и озвучиваю видео: от съёмки до готового ролика с голосом.',
    next: 'Новое направление — видео о путешествиях.',
    // A frame from the podcast intro (0:32), Anna's editing work.
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
  // and the card shows none. Clients are not named until Anna confirms
  // they may be (open questions: docs/CONTENT-REVIEW.md).
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

  // Four real reviews shown on annashelenkova.ru as screenshots of client
  // reviews for completed tasks (all rated 5.0). Text, names and task titles
  // are reproduced exactly, emoji included; avatars are not reused.
  testimonials: [
    {
      id: 'svetlana-k',
      author: 'Svetlana K.',
      context: 'Снять видео представление для сайта и рилсы в студии',
      quote:
        'Мне очень понравилось работать с Анной. Она настоящий профессионал, очень качественно выполняет работу. Помогла подобрать студию для съемки, помогла определиться с образами, привезла своё профессиональное оборудование, провела съемку в установленный срок. Успели заснять всё, что планировали, и видео получилось даже лучше, чем я ожидала! Однозначно рекомендую Анну!',
      rating: 5,
      placeholder: false,
    },
    {
      id: 'alena-k',
      author: 'Алена К.',
      context: 'Снять стильный видеоролик офиса для соцсетей',
      quote:
        'Анна большой профессионал своего дела, все очень понравилось\nБудем сотрудничать и в дальнейшем, спасибо большое!',
      rating: 5,
      placeholder: false,
    },
    {
      id: 'yulia-f',
      author: 'Юлия Ф.',
      context: 'Сделать рилс в готовом образе. Кто на белорусской',
      quote:
        'Классная девушка, профи 🥰 с задачей справилась на все 100. Быстро подъехала и спасла ситуацию 🙏 рекомендую',
      rating: 5,
      placeholder: false,
    },
    {
      id: 'aleksandra-h',
      author: 'Александра Х.',
      context: 'Смонтировать видео',
      quote: 'Отличный специалист со своим стилем и вкусом! Все очень быстро и качественно',
      rating: 5,
      placeholder: false,
    },
  ],

  // Confirmed by Anna. A channel without `href` shows a labelled placeholder.
  contacts: [
    {
      id: 'telegram',
      label: 'Telegram',
      href: 'https://t.me/Anna_NRL',
      value: '@Anna_NRL',
      placeholder: false,
    },
    {
      id: 'phone',
      label: 'Телефон',
      href: 'tel:+79651461372',
      value: '8(965)-146-13-72',
      placeholder: false,
    },
    {
      id: 'email',
      label: 'Почта',
      href: 'mailto:annashelenkova_nrl@mail.ru',
      value: 'annashelenkova_nrl@mail.ru',
      placeholder: false,
    },
    // The profile link has not been provided yet: never invent a URL.
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
  { id: 'testimonials', label: 'Отзывы' },
  { id: 'contact', label: 'Контакты' },
] as const;
