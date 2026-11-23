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
- `site/content.test.ts` — четыре услуги из брифа, ссылки категорий/услуг,
  честность заглушек (проект без медиа, отзыв без автора, контакт без ссылки
  обязаны быть `placeholder`).
- `lib/portfolio.test.ts` — фильтр работ по категориям.
- `lib/fonts.test.ts` — генерация `@font-face`: WOFF2, `swap`, только
  cyrillic/latin, fallback-метрики, диапазоны весов, настоящий курсив.

## E2E

E2E запускаются против **production-сборки** (`astro build` + `astro preview`),
собранной с нестандартным base **`/base-path-check`**. Любой хардкод `/путь`
(CSS, JS, изображения, ссылки) немедленно ломает тесты — так же, как сломал бы
GitHub Pages. Это проверено мутацией: замена `withBase('/favicon.svg')` на
`"/favicon.svg"` роняет smoke-тест.

Фикстура `tests/e2e/fixtures.ts` автоматически валит любой тест при
`console.error`, необработанном исключении, упавшем запросе или 4xx/5xx на ассет.

| Файл                 | Проекты                 | Что проверяет                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `smoke.spec.ts`      | chromium, mobile-webkit | 200, `<title>`, `lang`, один `h1`, viewport meta, CSS и токены применены, все внутренние ссылки/ассеты под base отвечают 200                                                                                                                                                                                                                                 |
| `navigation.spec.ts` | chromium, mobile-webkit | `/` → `/design/`, ровно 3 демо, переход в каждое и обратно, 404                                                                                                                                                                                                                                                                                              |
| `responsive.spec.ts` | responsive              | 320, 360, 375, 390, 393, 414, 430, 768, 1024, 1440, 1920 px × все маршруты: нет горизонтального скролла, ни один заголовок/абзац не вылезает из своего блока (длинные русские слова), `h1` и ссылки в пределах экрана, тап-цели ≥ 16 px, шрифт ≥ 12 px                                                                                                       |
| `concepts.spec.ts`   | chromium, mobile-webkit | Каждая концепция: 8 секций по порядку, видимые метки заглушек, шоурил в `<dialog>` (Esc/кнопка, возврат фокуса), фильтр работ, только same-origin запросы, свои шрифты загружены, ноль анимаций при reduced motion, мобильное меню (переход к секции, Esc). Плюс: титры (Cinematic), раскрытие строки указателя (Editorial), «вытаскивание» кадра (Creative) |
| `fonts.spec.ts`      | chromium, mobile-webkit | Только WOFF2 cyrillic/latin нужных семейств, бюджет КБ на страницу, без двойной загрузки preload, `font-display: swap`, preload шрифта h1; высоты секций с fallback vs с веб-шрифтом отличаются < 3% (390 и 1280 px); CLS при задержке шрифтов на 1,2 с < 0,05                                                                                               |

Проверка fallback-метрик сделана честно: без fallback-шрифтов разница высот
секций 5–8% и тест падает; с откалиброванными метриками — ≤ 2,1%.

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
