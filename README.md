# anna-portfolio

Сайт-портфолио видеографа. Построен на переиспользуемом стартере
**Astro + TypeScript (strict) + Tailwind CSS 4** со статической сборкой.

- Демо (GitHub Pages): https://v-mendelev.github.io/anna-portfolio/design/
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
pnpm dev                # http://localhost:4321/design/
```

`github-personal` — SSH Host alias для личного GitHub-ключа (см. DEPLOYMENT.md).
Обычный `git@github.com:...` тоже работает, если ваш ключ по умолчанию подходит.

## Команды

| Команда                        | Что делает                                                     |
| ------------------------------ | -------------------------------------------------------------- |
| `pnpm dev`                     | Dev-сервер с HMR                                               |
| `pnpm build`                   | Сборка для локального/корневого хостинга (`base = /`)          |
| `pnpm build:pages`             | Сборка для GitHub Pages (`base = /anna-portfolio`)             |
| `pnpm build:timeweb`           | Сборка для Timeweb Cloud (`base = /`, `SITE_URL` из окружения) |
| `pnpm preview`                 | Просмотр собранного `dist/`                                    |
| `pnpm typecheck`               | `astro check` (TypeScript strict + .astro)                     |
| `pnpm lint` / `lint:fix`       | ESLint                                                         |
| `pnpm format` / `format:check` | Prettier                                                       |
| `pnpm test`                    | Unit-тесты (Vitest)                                            |
| `pnpm test:e2e`                | Playwright: smoke, навигация, адаптивность (11 ширин)          |
| `pnpm test:smoke`              | Быстрый smoke в Chromium                                       |
| `pnpm test:visual`             | Визуальная регрессия (opt-in, см. TESTING.md)                  |
| `pnpm check`                   | typecheck + lint + format + unit + build                       |
| `pnpm verify`                  | `check` + E2E — полная регрессия перед завершением задачи      |

## Структура

```
src/
  site/          # ← ВСЁ проектно-специфичное (тексты, URL, список демо)
  lib/           # переиспользуемая логика (paths, deploy, integrations)
  config/        # feature flags из PUBLIC_* переменных
  components/    # ui/ — базовые компоненты, demo/ — заготовки демо
  layouts/       # BaseLayout (meta, robots, canonical, skip-link)
  styles/        # global.css: Tailwind 4 + дизайн-токены (@theme)
  pages/         # маршруты: /design/, /design/{cinematic,editorial,creative}/
tests/e2e/       # Playwright smoke/навигация/адаптивность
tests/visual/    # визуальная регрессия (opt-in)
deploy/timeweb/  # nginx-конфигурация для будущего Timeweb Cloud
.github/         # CI/CD, rulesets, dependabot, шаблон PR
```

## Документация

- [ARCHITECTURE.md](ARCHITECTURE.md) — архитектура, точки интеграции, использование как шаблона
- [TESTING.md](TESTING.md) — стратегия тестирования
- [DEPLOYMENT.md](DEPLOYMENT.md) — GitHub Pages, Timeweb, ветки, rollback, защита main
- [CLAUDE.md](CLAUDE.md) — правила разработки (для людей и ИИ-агентов)

## Использование как шаблона

Репозиторий готов к пометке **Template repository** (Settings → General).
Для нового сайта: создать репозиторий из шаблона → отредактировать `src/site/`
→ заменить страницы в `src/pages/` → обновить `README.md`. Подробно — в
[ARCHITECTURE.md](ARCHITECTURE.md#использование-как-шаблона).
