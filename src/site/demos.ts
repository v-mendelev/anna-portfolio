import { defineDemos } from '../lib/site';

/**
 * Design demo variants shown on /design/.
 * Each slug must have a page at src/pages/design/<slug>/index.astro
 * (enforced by src/site/demos.test.ts).
 */
export const demos = defineDemos([
  {
    slug: 'cinematic',
    title: 'Cinematic',
    summary: 'Кинематографичная подача: крупные кадры, тёмная палитра, акцент на видео.',
  },
  {
    slug: 'editorial',
    title: 'Editorial',
    summary: 'Журнальная вёрстка: типографика, сетка, истории проектов.',
  },
  {
    slug: 'creative',
    title: 'Creative',
    summary: 'Экспериментальная подача: смелые формы, движение, необычная навигация.',
  },
]);

export type DemoSlug = (typeof demos)[number]['slug'];
