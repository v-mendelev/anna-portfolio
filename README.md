# anna-portfolio

Сайт-портфолио видеографа. Построен на переиспользуемом стартере
**Astro + TypeScript (strict) + Tailwind CSS 4** со статической сборкой.

- Сайт (GitHub Pages): https://v-mendelev.github.io/anna-portfolio/
- Ветки: `dev` — разработка/staging, `main` — опубликованная демо-версия.

## Требования

| Инструмент | Версия                                      |
| ---------- | ------------------------------------------- |
| Node.js    | 26 LTS (минимум 22.23.4, см. `.nvmrc`)      |
| pnpm       | 12.x (закреплён в `packageManager`)         |
| Git        | 2.4x+                                       |
| ОС         | Windows 11 (нативно, без WSL), macOS, Linux |

## Быстрый старт (Windows PowerShell)

```powershell
git clone git@github-personal:v-mendelev/anna-portfolio.git
cd anna-portfolio
pnpm install
pnpm test:e2e:install   # один раз: браузеры Playwright (Chromium + WebKit)
pnpm dev                # http://127.0.0.1:4321/
```

`github-personal` — SSH Host alias для личного GitHub-ключа (см. DEPLOYMENT.md).
Обычный `git@github.com:...` тоже работает, если ваш ключ по умолчанию подходит.

## Просмотр сайта локально

```powershell
pnpm dev                      # быстрый режим разработки
# или как в продакшене (статическая сборка):
pnpm build; pnpm preview
```

Сайт — одна страница: http://127.0.0.1:4321/ (дизайн «Кадр»). Старые ссылки на
концепции (`/design/`, `/design/cinematic/`, `/design/editorial/`,
`/design/creative/`) перенаправляют на главную.

Dev- и preview-сервер слушают `127.0.0.1:4321` (`server.host` в `astro.config.ts`):
на Windows `localhost` разрешается в `::1`, и без этого сервер был доступен только по IPv6.
Для доступа из локальной сети: `pnpm dev --host`. Если PowerShell блокирует `pnpm.ps1`
(политика выполнения скриптов), запускайте `pnpm.cmd dev`. Пока dev-сервер запущен,
E2E запускайте на другом порту: `$env:E2E_PORT=4400; pnpm test:e2e`.

Мобильный вид — DevTools (F12 → Toggle device toolbar) или `pnpm screenshots`
(см. TESTING.md). Работы, шоурил, фото, текст «Обо мне» и контакты пока заглушки
с меткой «Заглушка».

## Замена контента

Всё содержимое — в `src/site/content.ts`; компоненты в `src/site/components/`
только раскладывают его. Медиа указываются **ключом** относительно корня медиа
(`work/fashion/video.mp4`): это `public/media/` или CDN из
`PUBLIC_MEDIA_BASE_URL`. Веб-версии собирает `pnpm media:build` из оригиналов
в `media-src/` (в Git не попадают) — подробно в [docs/MEDIA.md](docs/MEDIA.md).

| Что прислала Анна       | Где заменить (`content.ts`)                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| Шоурил (MP4) и обложка  | `showreel.video`, `showreel.poster`, `placeholder: false`                                 |
| Кадр для первого экрана | `hero.still.poster`                                                                       |
| Работы                  | `projects[]`: `title`, `category`, `roles`, `video`/`poster`, `placeholder: false`        |
| Портрет и текст о себе  | `person.portrait`, `person.bio`, `placeholderBio: false`                                  |
| Контакты                | `contacts[]`: `href` (`https://t.me/…`, `mailto:`, `tel:`), `value`, `placeholder: false` |
| Отзывы                  | `testimonials[]` — только реальные, дословно; блок «Отзывы» выводится, если есть отзывы   |

Слот с `video` показывает плеер, только с `poster` — картинку, без файла — метку
«Заглушка» (пустого плеера и «мёртвых» кнопок нет). Контакт без `href`
показывается как подписанная заглушка без ссылки (сейчас — только YouDo). Название,
описание и превью для соцсетей — `src/site/site.config.ts`; после правки текста
превью — `pnpm brand:images`.

## Команды

| Команда                        | Что делает                                                     |
| ------------------------------ | -------------------------------------------------------------- |
| `pnpm dev`                     | Dev-сервер с HMR                                               |
| `pnpm build`                   | Сборка для локального/корневого хостинга (`base = /`)          |
| `pnpm build:pages`             | Сборка для GitHub Pages (`base = /anna-portfolio`)             |
| `pnpm build:timeweb`           | Сборка для Timeweb Cloud (`base = /`, `SITE_URL` из окружения) |
| `pnpm preview`                 | Просмотр собранного `dist/`                                    |
| `pnpm media:build`             | Веб-версии видео и постеров из `media-src/` (нужен ffmpeg)     |
| `pnpm typecheck`               | `astro check` (TypeScript strict + .astro)                     |
| `pnpm lint` / `lint:fix`       | ESLint                                                         |
| `pnpm format` / `format:check` | Prettier                                                       |
| `pnpm test`                    | Unit-тесты (Vitest)                                            |
| `pnpm test:e2e`                | Playwright: smoke, навигация, главная, шрифты, адаптивность    |
| `pnpm fonts:metrics`           | Первичный расчёт fallback-метрик шрифтов (см. ARCHITECTURE.md) |
| `pnpm screenshots`             | Скриншоты страниц: Chromium + WebKit, desktop + mobile         |
| `pnpm brand:images`            | Пересобрать og.png, favicon.ico и apple-touch-icon из токенов  |
| `pnpm test:smoke`              | Быстрый smoke в Chromium                                       |
| `pnpm test:visual`             | Визуальная регрессия (opt-in, см. TESTING.md)                  |
| `pnpm check`                   | typecheck + lint + format + unit + build                       |
| `pnpm verify`                  | `check` + E2E — полная регрессия перед завершением задачи      |

## Структура

```
src/
  site/          # ← ВСЁ проектно-специфичное: контент, конфиг, шрифты, компоненты сайта (KADR)
  lib/           # переиспользуемая логика (paths, deploy, fonts, portfolio, ui, integrations)
  config/        # feature flags из PUBLIC_* переменных
  components/    # ui/ — базовые переиспользуемые компоненты
  layouts/       # BaseLayout (meta, Open Graph, robots, canonical, skip-link), RedirectLayout
  styles/        # global.css: Tailwind 4 + дизайн-токены (@theme)
  pages/         # маршруты: / (сайт), 404, старые /design/... → редирект на /
tests/e2e/       # Playwright: smoke, навигация, главная, шрифты, адаптивность
scripts/         # dev-утилиты (fallback-метрики шрифтов, картинки бренда); delivery/ — CI-скрипт конвейера доставки
tests/visual/    # визуальная регрессия (opt-in)
deploy/timeweb/  # nginx-конфигурация для будущего Timeweb Cloud
.github/         # CI/CD, rulesets, dependabot, шаблон PR
```

## Документация

- [ARCHITECTURE.md](ARCHITECTURE.md) — архитектура, точки интеграции, использование как шаблона
- [TESTING.md](TESTING.md) — стратегия тестирования
- [DEPLOYMENT.md](DEPLOYMENT.md) — GitHub Pages, Timeweb, ветки, rollback, защита main
- [DELIVERY.md](DELIVERY.md) — автоматическая доставка одобренных изменений до демо (GitHub App, merge по SHA после CI, live smoke)
- [CLAUDE.md](CLAUDE.md) — правила разработки (для людей и ИИ-агентов)

## Использование как шаблона

Репозиторий готов к пометке **Template repository** (Settings → General).
Для нового сайта: создать репозиторий из шаблона → отредактировать `src/site/`
→ заменить страницы в `src/pages/` → обновить `README.md`. Подробно — в
[ARCHITECTURE.md](ARCHITECTURE.md#использование-как-шаблона).
