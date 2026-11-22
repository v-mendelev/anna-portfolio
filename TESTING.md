# Тестирование

## Уровни

| Уровень              | Инструмент                                          | Где                            | Запуск                           |
| -------------------- | --------------------------------------------------- | ------------------------------ | -------------------------------- |
| Типы                 | `astro check` (TS 6, strict)                        | весь проект, включая `.astro`  | `pnpm typecheck`                 |
| Линт                 | ESLint 10 + typescript-eslint + eslint-plugin-astro | весь проект                    | `pnpm lint`                      |
| Форматирование       | Prettier (+ astro, tailwind)                        | весь проект                    | `pnpm format:check`              |
| Unit                 | Vitest 5                                            | `src/**/*.test.ts`             | `pnpm test`                      |
| Сборка               | `astro build` (local + pages)                       | —                              | `pnpm build`, `pnpm build:pages` |
| Smoke/E2E            | Playwright (Chromium, WebKit iPhone 13)             | `tests/e2e/`                   | `pnpm test:e2e`                  |
| Адаптивность         | Playwright, 11 ширин                                | `tests/e2e/responsive.spec.ts` | входит в `test:e2e`              |
| Визуальная регрессия | Playwright `toHaveScreenshot`                       | `tests/visual/`                | `pnpm test:visual` (opt-in)      |

Полная регрессия: **`pnpm verify`**.

## Unit-тесты

- `lib/paths.test.ts` — `joinBase`/`stripBase`: base `/` и `/repo`, внешние URL, якоря.
- `lib/deploy/resolve.test.ts` — выбор target, приоритет env над defaults, ошибки.
- `lib/integrations/*.test.ts` — валидация лида, honeypot, отсутствие PII в ошибках,
  HTTP-канал (URL, метод, тело, 422/5xx, сеть, таймаут) с мок-`fetch`.
- `site/demos.test.ts` — уникальность slug и соответствие демо ↔ страницы.

## E2E

E2E запускаются против **production-сборки** (`astro build` + `astro preview`),
собранной с нестандартным base **`/base-path-check`**. Любой хардкод `/путь`
(CSS, JS, изображения, ссылки) немедленно ломает тесты — так же, как сломал бы
GitHub Pages. Это проверено мутацией: замена `withBase('/favicon.svg')` на
`"/favicon.svg"` роняет smoke-тест.

Фикстура `tests/e2e/fixtures.ts` автоматически валит любой тест при
`console.error`, необработанном исключении, упавшем запросе или 4xx/5xx на ассет.

| Файл                 | Проекты                 | Что проверяет                                                                                                                                                             |
| -------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke.spec.ts`      | chromium, mobile-webkit | 200, `<title>`, `lang`, один `h1`, viewport meta, CSS и токены применены, все внутренние ссылки/ассеты под base отвечают 200                                              |
| `navigation.spec.ts` | chromium, mobile-webkit | `/` → `/design/`, ровно 3 демо, переход в каждое и обратно, 404                                                                                                           |
| `responsive.spec.ts` | responsive              | 320, 360, 375, 390, 393, 414, 430, 768, 1024, 1440, 1920 px × все маршруты: нет горизонтального скролла, `h1` и ссылки в пределах экрана, тап-цели ≥ 16 px, шрифт ≥ 12 px |

Маршруты и ширины задаются в одном месте — `tests/e2e/routes.ts`.
Новая страница = новая строка в `ROUTES` → автоматически smoke + адаптивность.

### Локально (Windows)

```powershell
pnpm test:e2e:install      # один раз
pnpm test:e2e              # собирает и поднимает preview сам
pnpm exec playwright show-report
```

Если порт 4321 занят: `$env:E2E_PORT=4400; pnpm test:e2e`.

## Визуальная регрессия (инфраструктура)

- Проект Playwright `visual`, тесты `tests/visual/pages.spec.ts`
  (4 маршрута × 375/768/1440 px, полностраничные снимки).
- Эталоны платформозависимы (`*-linux.png`, `*-win32.png`). Каноническая
  платформа — Linux (CI).
- Сгенерировать/обновить эталоны: Actions → **Visual regression** → Run workflow,
  `mode=update` → скачать артефакт `visual-baselines-linux` → положить в
  `tests/visual/pages.spec.ts-snapshots/` → закоммитить.
- Проверка: тот же workflow с `mode=check`; отчёт с диффом — артефакт `visual-report`.
- Локально для себя: `pnpm test:visual:update` (создаст `*-win32.png`), затем `pnpm test:visual`.

Пока дизайн не разработан, эталоны не коммитятся и визуальные тесты не входят в
обязательный CI (иначе каждое дизайн-изменение ломало бы сборку). Включить в CI —
добавить шаг `pnpm test:visual` в `ci.yml` после появления стабильного дизайна.

## CI

`.github/workflows/ci.yml` на каждый PR в `dev`/`main` и push в `dev`:

1. **Quality** (Ubuntu + Windows): install `--frozen-lockfile` → typecheck → lint →
   format:check → unit → build (local) → build (pages).
2. **E2E** (Ubuntu): Playwright Chromium + WebKit; отчёт — артефакт.
3. **CI passed** — агрегирующий job; именно он указывается как required check.

## Правила

- Новая логика → unit-тест. Новая страница → `ROUTES`. Баг → тест, который его ловит.
- Не ослаблять проверки и не помечать тесты `skip` ради зелёного CI.
- Перед завершением задачи — `pnpm verify`.
