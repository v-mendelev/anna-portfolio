import { defineDemos } from '../lib/site';

/**
 * Design demo variants shown on /design/.
 * Each slug must have a page at src/pages/design/<slug>/index.astro
 * (enforced by src/site/demos.test.ts). Slugs are kept from the first round
 * of concepts so existing links keep working; the concepts behind them are new.
 */
export const demos = defineDemos([
  {
    slug: 'cinematic',
    title: 'Кадр',
    summary: 'Тяжёлый гротеск, кадрирование по третям, работы — контактный лист.',
  },
  {
    slug: 'editorial',
    title: 'Склейка',
    summary: 'Монтажная склейка как графический язык, развороты на чёрных плашках.',
  },
  {
    slug: 'creative',
    title: 'Рапид',
    summary: 'Переменная ширина шрифта, таймлайн вместо меню, работы — лента кадров.',
  },
]);

export type DemoSlug = (typeof demos)[number]['slug'];
