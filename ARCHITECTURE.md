# Архитектура

## Принципы

- **Статика по умолчанию.** `output: 'static'` — дешёвый хостинг, нет серверной части.
- **Слои с явными границами.** Переиспользуемый стартер отделён от данных проекта.
- **Один код — несколько хостингов.** `site`/`base` вычисляются из `DEPLOY_TARGET`.
- **Интеграции через контракты.** Точки расширения описаны типами, реализации
  подключаются без переписывания страниц.

## Слои

```
┌──────────────────────────────────────────────────────────┐
│ src/pages/            маршруты (тонкие: собирают компоненты) │
├──────────────────────────────────────────────────────────┤
│ src/layouts/          документ: meta, robots, canonical     │
│ src/components/ui/    базовые компоненты (Container, LinkCard)│
│ src/components/demo/  заготовки демоверсий                  │
├──────────────────────────────────────────────────────────┤
│ src/site/             ПРОЕКТ: site.config.ts, demos.ts      │
├──────────────────────────────────────────────────────────┤
│ src/lib/              переиспользуемая логика без UI        │
│   paths.ts            withBase(): безопасные URL под base   │
│   deploy/resolve.ts   DEPLOY_TARGET → { site, base }        │
│   site.ts             контракт SiteConfig / DemoVariant     │
│   integrations/       форма обратной связи, Backend API     │
│ src/config/features.ts  флаги из PUBLIC_* переменных         │
│ src/styles/global.css   Tailwind 4 + дизайн-токены (@theme) │
└──────────────────────────────────────────────────────────┘
```

Правило зависимостей: `pages → layouts/components → site → lib`.
`lib/` не импортирует ничего из `site/`, `components/`, `pages/`.

## Маршруты

| URL                  | Файл                                             |
| -------------------- | ------------------------------------------------ |
| `/`                  | `pages/index.astro` — meta-refresh на `/design/` |
| `/design/`           | `pages/design/index.astro` — выбор демо          |
| `/design/cinematic/` | `pages/design/cinematic/index.astro`             |
| `/design/editorial/` | `pages/design/editorial/index.astro`             |
| `/design/creative/`  | `pages/design/creative/index.astro`              |
| (любой другой)       | `pages/404.astro`                                |

Список демо — `src/site/demos.ts`. Unit-тест `demos.test.ts` гарантирует, что
для каждого демо есть страница и нет «лишних» директорий.

Каждая демоверсия — отдельная папка страниц: при разработке дизайна у каждой
будут свои компоненты (`src/components/demo/<slug>/`) и, при необходимости,
свои токены, не влияющие на остальные.

## Deploy targets

`astro.config.ts` вызывает `resolveDeployConfig()` (`src/lib/deploy/resolve.ts`):

| `DEPLOY_TARGET` | site / base по умолчанию                               | Кто задаёт            |
| --------------- | ------------------------------------------------------ | --------------------- |
| `local`         | `http://localhost:4321` / `/`                          | по умолчанию          |
| `github-pages`  | `siteConfig.deploy.githubPagesUrl` → `/anna-portfolio` | CI: `configure-pages` |
| `timeweb`       | `siteConfig.deploy.timewebUrl` или `SITE_URL` / `/`    | CI: vars окружения    |

`SITE_URL` и `BASE_PATH` из окружения имеют приоритет. Все внутренние URL строятся
через `withBase()`, поэтому смена `base` не ломает CSS, JS, изображения и ссылки
(проверяется E2E со специально нестандартным base `/base-path-check`).

## Точки интеграции

Сайт статический, поэтому всё, что требует секретов, выполняется **на бэкенде**.
Браузер знает только публичный URL API.

```
 Браузер (форма)                Backend API (будущий)            Внешние сервисы
 ┌──────────────┐  POST /leads  ┌───────────────────────┐        ┌───────────┐
 │ LeadService  │──────────────▶│ валидация, антиспам,  │──────▶ │ Telegram  │
 │ validateLead │  JSON         │ rate-limit, секреты   │──────▶ │ CRM       │
 └──────────────┘               └───────────────────────┘──────▶ │ e-mail    │
   PUBLIC_API_BASE_URL                TELEGRAM_BOT_TOKEN…          └───────────┘
```

| Интеграция     | Где в коде (frontend)                                                         | Статус                     |
| -------------- | ----------------------------------------------------------------------------- | -------------------------- |
| Анкета / форма | `lib/integrations/lead.ts` (валидация, honeypot), `lead-service.ts`           | контракт + тесты, UI нет   |
| Backend API    | `lib/integrations/http-channel.ts` (`POST {API}/leads`, таймаут, коды ошибок) | готов к подключению        |
| Telegram-бот   | только на бэкенде (секрет `TELEGRAM_BOT_TOKEN`)                               | не реализуется во frontend |
| CRM            | только на бэкенде; во frontend — тот же `LeadChannel`                         | не реализуется во frontend |
| Включение      | `config/features.ts`: `features.leadForm = Boolean(PUBLIC_API_BASE_URL)`      | выключено                  |

Контракт `LeadChannel` (`types.ts`) позволяет подключить другой транспорт
(например, сервис форм) без изменения страниц: `createLeadService({ channel })`.

Рекомендуемый бэкенд, когда понадобится: одна serverless-функция
(Timeweb Cloud Functions или аналог) с эндпоинтом `POST /leads`, принимающая
`LeadInput` без поля `website`, отвечающая `201 {id}` / `422` / `5xx`.
БД не нужна, пока лиды уходят в Telegram/CRM.

## Дизайн-система

`src/styles/global.css` содержит токены в `@theme` (Tailwind 4 генерирует из них
утилиты `bg-surface`, `text-ink-muted`, `max-w-page` и т. д.). Сейчас токены
нейтральные — финальная визуальная система появится при разработке демо.
Компоненты не используют «сырые» цвета.

## Использование как шаблона

1. Settings → General → **Template repository**.
2. Новый репозиторий: **Use this template**.
3. Отредактировать `src/site/site.config.ts` (имя, язык, URL хостингов) и
   `src/site/demos.ts` (или удалить демо и их страницы).
4. Заменить `src/pages/*` под новый проект, обновить `tests/e2e/routes.ts`.
5. Обновить `package.json` (`name`, `description`) и `README.md`.
6. Включить Pages (Source: GitHub Actions) и rulesets — см. DEPLOYMENT.md.

Ничего в `src/lib/`, `src/components/ui/`, `src/layouts/`, `.github/`, `tests/`
не содержит данных конкретного клиента.
