import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { resolveDeployConfig } from './src/lib/deploy/resolve';
import { siteConfig } from './src/site/site.config';

// Deploy target is selected with DEPLOY_TARGET (local | github-pages | timeweb).
// SITE_URL / BASE_PATH override the per-target defaults from src/site/site.config.ts.
const deploy = resolveDeployConfig(
  {
    DEPLOY_TARGET: process.env.DEPLOY_TARGET,
    SITE_URL: process.env.SITE_URL,
    BASE_PATH: process.env.BASE_PATH,
  },
  siteConfig.deploy,
);

// https://astro.build/config
export default defineConfig({
  site: deploy.site,
  base: deploy.base,
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
