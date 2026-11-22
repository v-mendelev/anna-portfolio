import { defineSiteConfig } from '../lib/site';

/**
 * Project-specific configuration.
 * When reusing this repository as a template, edit files in `src/site/` only.
 */
export const siteConfig = defineSiteConfig({
  name: 'Анна Шеленкова — видеограф',
  description: 'Портфолио видеографа. Демоверсии дизайна сайта.',
  lang: 'ru',
  locale: 'ru_RU',
  deploy: {
    githubPagesUrl: 'https://v-mendelev.github.io/anna-portfolio/',
    // Fill in when the Timeweb Cloud domain is known (or pass SITE_URL in CI).
    timewebUrl: undefined,
  },
});
