import { defineSiteConfig } from '../lib/site';

/**
 * Project-specific configuration: name, metadata, deploy URLs.
 * When reusing this repository as a template, edit files in `src/site/` only.
 */
export const siteConfig = defineSiteConfig({
  name: 'Анна Шеленкова — видеограф',
  // <title> of the home page: name, profession and what she does.
  homeTitle: 'Анна Шеленкова — видеограф: съёмка, монтаж и озвучка видео',
  description:
    'Видеограф Анна Шеленкова: снимает, монтирует и озвучивает видео — от съёмки до готового ролика с голосом. Шоурил, работы и услуги.',
  lang: 'ru',
  locale: 'ru_RU',
  // Social preview, 1200×630, in /public (regenerate: `pnpm brand:images`).
  ogImage: { path: '/og.png', width: 1200, height: 630, alt: 'Анна Шеленкова — видеограф' },
  themeColor: '#ffffff',
  deploy: {
    githubPagesUrl: 'https://v-mendelev.github.io/anna-portfolio/',
    // Fill in when the Timeweb Cloud domain is known (or pass SITE_URL in CI).
    timewebUrl: undefined,
  },
});
