# Развёртывание

## Обзор

| Окружение  | Ветка  | Хостинг       | Workflow             | Статус                  |
| ---------- | ------ | ------------- | -------------------- | ----------------------- |
| Demo       | `main` | GitHub Pages  | `deploy-pages.yml`   | активно                 |
| Staging    | `dev`  | Timeweb Cloud | `deploy-timeweb.yml` | подготовлено, выключено |
| Production | `main` | Timeweb Cloud | `deploy-timeweb.yml` | подготовлено, выключено |

Любой деплой **зависит от CI**: deploy-workflow вызывает `ci.yml`
(`workflow_call`) и запускает сборку только после зелёного `CI passed`.

## Ветки

```
feature/* ──PR──▶ dev ──PR──▶ main ──▶ GitHub Pages (demo)
                   │                  └─▶ Timeweb production (когда включим)
                   └─▶ Timeweb staging (когда включим)
```

- `main` — защищена ruleset'ом: только PR, обязательный check `CI passed`,
  запрет force-push и удаления.
- `dev` — запрет force-push и удаления, check `CI passed` в PR (админ может пушить напрямую;
  рекомендуется убрать этот bypass — см. [DELIVERY.md](DELIVERY.md#разовая-настройка-активация--только-после-согласования)).

**Автоматическая доставка** одобренных изменений (`/publish-approve <SHA>` →
merge App'ом в `dev` после зелёного CI → promotion PR → `main` → Pages → live
smoke) описана в [DELIVERY.md](DELIVERY.md). Без переменной `DELIVERY_REPOSITORY`
всё делается вручную.

## GitHub Pages

Workflow `.github/workflows/deploy-pages.yml`:

1. `checks` — полный CI (`ci.yml`).
2. `build` — `actions/configure-pages` выдаёт `origin` и `base_path`
   → `DEPLOY_TARGET=github-pages`, `SITE_URL`, `BASE_PATH` → официальный
   **`withastro/action@v6`** собирает и загружает артефакт.
3. `deploy` — `actions/deploy-pages@v5` в окружение `github-pages`.
4. `verify` — live smoke (`node scripts/delivery/run.ts live-smoke`): ждёт, пока
   `build-info.json` на сайте покажет SHA этого деплоя, затем проверяет 200 на всех
   маршрутах из `tests/e2e/routes.ts` и на всех CSS/JS/шрифтах; результат — commit
   status `delivery/live` (с URL сайта) и summary запуска.

URL: https://v-mendelev.github.io/anna-portfolio/ (→ `/design/`).

### Base path

Сайт проекта на Pages живёт в `/<repo>/`. `base` берётся из `configure-pages`,
поэтому работает и для форка/переименования, и для кастомного домена (base `/`).
Все внутренние URL — через `withBase()`; E2E собирают сайт с base
`/base-path-check` и проверяют каждый ассет и ссылку.

### Первичная настройка (вручную, один раз)

PAT, которым настраивался репозиторий, не имеет прав Administration/Pages, поэтому
эти шаги выполняются в веб-интерфейсе:

1. **Pages:** Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. **Rulesets:** Settings → Rules → Rulesets → New → **Import a ruleset** →
   загрузить `.github/rulesets/main.json`, затем `.github/rulesets/dev.json`.
   (Альтернатива с токеном, у которого есть Administration: write:
   `gh api repos/OWNER/REPO/rulesets --method POST --input .github/rulesets/main.json`.)
3. **Default branch:** оставить `main`.
4. **Template:** Settings → General → ☑ Template repository (по желанию).
5. **Actions:** Settings → Actions → General → Workflow permissions:
   «Read repository contents» (по умолчанию; workflow сами запрашивают нужные права).

## Rollback

Любой из вариантов (от предпочтительного):

1. **`git revert`** проблемного коммита → PR в `main` → автоматический деплой.
2. **Re-deploy старой версии:** Actions → _Deploy demo to GitHub Pages_ →
   Run workflow (ветка `main`) → `ref` = SHA/тег рабочей версии. Workflow прогонит
   CI для этого SHA и опубликует его. Следующий push в `main` снова опубликует HEAD.
   Live smoke проверит, что на сайте именно этот SHA.
3. Ставьте теги на стабильные версии (`git tag demo-2026-11-23 && git push --tags`) —
   их удобно указывать в `ref`.

Для Timeweb: тот же `ref` в _Deploy to Timeweb Cloud_; кроме того, на сервере
хранятся 5 последних релизов (`releases/<sha>`), откат вручную —
`ln -sfn releases/<sha> current`.

## Timeweb Cloud (подготовлено, не создано)

Платные ресурсы не создавались. Есть два пути:

### A. VPS + nginx (workflow уже готов)

1. Создать VPS, установить nginx, пользователя `deploy` с SSH-ключом
   (отдельный ключ только для деплоя).
2. Каталог `/var/www/site/` (права пользователя `deploy`), конфигурация —
   `deploy/timeweb/nginx.conf` + `security-headers.conf`, TLS через certbot.
3. GitHub → Settings → Environments: создать `staging` (deployment branch: `dev`)
   и `production` (branch: `main`, required reviewers — по желанию).
   - Variables: `SITE_URL`, `PUBLIC_SITE_INDEXABLE` (`true` только в production),
     при появлении бэкенда — `PUBLIC_API_BASE_URL`.
   - Secrets: `TIMEWEB_SSH_HOST`, `TIMEWEB_SSH_USER`, `TIMEWEB_SSH_KEY`
     (приватный ключ деплоя), `TIMEWEB_KNOWN_HOSTS` (вывод `ssh-keyscan <host>`),
     `TIMEWEB_PATH` (`/var/www/site`).
4. Repository variable `TIMEWEB_DEPLOY_ENABLED=true`.

### B. Timeweb Cloud Apps (сборка на стороне Timeweb)

Подключить репозиторий в панели Apps, тип «Frontend / статический сайт»:
команда сборки `pnpm install --frozen-lockfile && pnpm build:timeweb`,
каталог `dist`, переменные `SITE_URL`, `PUBLIC_SITE_INDEXABLE`.
В этом случае `deploy-timeweb.yml` не включать (но CI и защита веток остаются).

Локальная проверка сборки для Timeweb (PowerShell):

```powershell
$env:SITE_URL='https://example.ru'; pnpm build:timeweb; Remove-Item Env:SITE_URL
```

## Секреты и доступы

- Секреты — только GitHub Secrets / переменные окружения хостинга.
- В браузер попадают только `PUBLIC_*` переменные (см. `.env.example`).
- Локальная разработка: SSH alias `github-personal` (`~/.ssh/config`) с отдельным
  ключом `~/.ssh/id_ed25519_github_personal`; корпоративные ключи не используются.
- GitHub CLI в этом проекте используется с fine-grained PAT через переменную
  `GH_TOKEN` только в памяти процесса; токен нигде не сохраняется.
