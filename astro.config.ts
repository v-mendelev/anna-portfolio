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
  // Dev/preview server only (no effect on the static build). The default host
  // `localhost` resolves to ::1 first on Windows, so Node listened on IPv6 only
  // and http://127.0.0.1:4321 was refused. Bind IPv4 loopback explicitly.
  // `--host` on the command line still overrides this (e.g. for LAN testing).
  server: {
    host: '127.0.0.1',
    port: 4321,
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Never inline scripts or assets into HTML: the page script ships as a
      // cacheable /_astro/*.js file. The post-deploy live smoke
      // (src/lib/delivery/live.ts) requires at least one same-origin JS, CSS
      // and font file and checks each answers 200; an inlined script would
      // leave nothing to check and fail the deploy verification.
      assetsInlineLimit: 0,
    },
  },
});
