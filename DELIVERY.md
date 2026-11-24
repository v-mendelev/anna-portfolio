# Автоматическая доставка: feature → dev → main → Pages

Конвейер публикует **одобренное** изменение без ручных кликов в GitHub:

```
feature/x ──PR──▶ dev ──PR (promotion)──▶ main ──▶ GitHub Pages ──▶ live smoke
   │  ▲             │  ▲                      │
   │  └ /publish-approve <SHA> (владелец)     └─ sync PR main → dev (без изменений файлов)
   └─ после merge ветка удаляется
```

Статус: **код готов, автоматизация выключена.** Пока не выполнена разовая
настройка (ниже) и не задана переменная `DELIVERY_REPOSITORY`, все workflow
`delivery-*` пропускаются, и всё работает как раньше (ручные PR и merge).

## Как это работает

| Шаг | Кто/что                                         | Механизм                                                                                                                                                                                          |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Claude Code                                     | ветка `feature/*`, `pnpm verify`, push (SSH `github-personal`), PR в `dev`                                                                                                                        |
| 2   | Владелец в чате Claude Code → Claude            | комментарий в PR ровно `/publish-approve <полный SHA head>`                                                                                                                                       |
| 3   | `delivery-approve.yml` (issue_comment)          | проверяет автора, PR и SHA → пишет commit status `delivery/approval` (от App) на этот SHA → включает **native auto-merge (squash)** с `expectedHeadOid` = SHA                                     |
| 4   | GitHub                                          | после зелёного `CI passed` сам мёржит PR в `dev`                                                                                                                                                  |
| 5   | `delivery-pr.yml` (pull_request_target, closed) | удаляет ветку `feature/*`, если она всё ещё указывает на смёрженный SHA                                                                                                                           |
| 6   | `delivery-promote.yml` (push в dev)             | один PR `dev → main`: каждый коммит `main..dev` должен быть из одобренного PR или нейтральным → auto-merge (merge commit) на точный SHA dev                                                       |
| 7   | GitHub                                          | после зелёного CI на promotion PR мёржит в `main`                                                                                                                                                 |
| 8   | `deploy-pages.yml` (push в main)                | CI → сборка с `build-info.json` (SHA) → deploy → **live smoke**: SHA на сайте = SHA коммита, 200 на всех маршрутах из `tests/e2e/routes.ts`, все CSS/JS/шрифты 200 → status `delivery/live` с URL |
| 9   | `delivery-promote.yml` (push в main)            | `main` требует «up to date» веток, поэтому merge-коммит из main возвращается в dev через sync PR — только если это не меняет ни одного файла; затем цикл останавливается (`nothing to promote`)   |

PR, auto-merge и merge выполняются **токеном GitHub App**, поэтому события от
них запускают CI и деплой Pages (события от `GITHUB_TOKEN` workflow не запускают).

### Что НЕ мёржится автоматически

- PR без одобрения, с одобрением другого SHA (после одобрения были новые
  коммиты — auto-merge выключается сразу на `synchronize`), draft, из форка,
  не из `feature/*`, не в `dev`, от ботов и **Dependabot**.
- PR, меняющие `.github/`, `scripts/delivery/`, `src/lib/delivery/` — сам
  конвейер и workflow меняются только ручным merge (у App к тому же нет права
  `workflows`).
- Promotion, если в `dev` есть хоть что-то неодобренное: прямой push, PR,
  смёрженный вручную без одобрения, Dependabot. Тогда promotion PR остаётся
  открытым **без auto-merge**, в описании и в статусе `delivery/promotion`
  перечислено, что мешает. Решение — смёржить вручную после просмотра или
  одобрить соответствующий смёрженный PR (`/publish-approve <его head SHA>`,
  затем Actions → _Delivery · promote_ → Run, либо дождаться следующего push в dev).
- Обязательные проверки rulesets действуют и для App: красный CI = нет merge.

### Одобрение и граница доверия

- Одобрение — комментарий **ровно** `/publish-approve <40-символьный SHA>`
  (без текста вокруг) в PR. Учитываются только комментарии логинов из
  `DELIVERY_APPROVERS` (по умолчанию — владелец репозитория) с
  `author_association` OWNER/MEMBER/COLLABORATOR. Тексты PR, метки, комментарии
  остальных — игнорируются (без ответа). Ответ App и статус `delivery/approval`
  (кто, какой комментарий, какой SHA) — аудит-след в PR.
- Одобрение привязано к SHA: другой head → отказ; новые коммиты после
  одобрения → auto-merge выключается; merge идёт с `expectedHeadOid`/`sha`.
- Статус `delivery/approval` засчитывается, только если его создал бот App.
  Ключ App лежит в окружении `delivery`, доступном только веткам `main` и `dev`,
  поэтому workflow из feature-ветки не может подделать одобрение.
- **Честно о границе:** GitHub видит только, что комментарий оставлен
  аккаунтом владельца (через его fine-grained PAT). Он **не может проверить**,
  что владелец действительно сказал «да» в чате Claude Code. Это обеспечивается
  правилом в `CLAUDE.md` (Claude пишет `/publish-approve` только после явного
  одобрения конкретного PR в чате) и тем, что PAT вводится вручную на сессию
  (`Read-Host -AsSecureString`, только `GH_TOKEN` процесса). Кто держит PAT
  владельца, может одобрить публикацию. Для более строгой схемы одобряйте
  сами — тот же комментарий в веб-интерфейсе GitHub или с телефона.

## Права GitHub App (минимальные)

| Право (Repository)                                         | Уровень      | Зачем                                                         |
| ---------------------------------------------------------- | ------------ | ------------------------------------------------------------- |
| Contents                                                   | Read & write | merge PR, удаление смёрженных `feature/*` веток               |
| Pull requests                                              | Read & write | создать/обновить promotion и sync PR, auto-merge, комментарии |
| Commit statuses                                            | Read & write | `delivery/approval`, `delivery/promotion`                     |
| Metadata                                                   | Read         | обязательное                                                  |
| Workflows, Actions, Administration, Issues, Secrets, Pages | **нет**      | не нужны; PR с изменениями workflow мёржатся вручную          |

Токен установки выпускается на каждый запуск, только на этот репозиторий и
только с правами выше, хранится в памяти процесса, по окончании отзывается
(`DELETE /installation/token`), живёт ≤ 1 ч. Webhook у App не нужен.
Сторонних actions с доступом к ключу нет: скрипт `scripts/delivery/run.ts`
выполняется `node` без установки зависимостей (только встроенные модули).

## Разовая настройка (активация — только после согласования)

Порядок важен: сначала этот код должен оказаться в `main` (обычным ручным
merge: он меняет `.github/`), затем:

1. **Создать GitHub App** — Settings (профиля) → Developer settings → GitHub
   Apps → New:
   - имя, например `anna-portfolio-delivery`; Homepage URL — URL репозитория;
   - Webhook: **снять** «Active»;
   - Repository permissions — ровно как в таблице выше; остальные «No access»;
   - Where can this App be installed: **Only on this account**;
   - Create → записать **App ID** → Generate a private key (скачается `.pem`).
2. **Установить App** (Install App) → _Only select repositories_ →
   `anna-portfolio`.
3. **Окружение `delivery`** — repo Settings → Environments → New `delivery`:
   - Deployment branches and tags: **Selected branches** → `main`, `dev`;
   - без required reviewers (иначе каждый запуск потребует клика);
   - Environment secret `DELIVERY_APP_PRIVATE_KEY` = содержимое `.pem`
     целиком. После этого удалить `.pem` с диска.
4. **Repository variables** (Settings → Secrets and variables → Actions → Variables):
   - `DELIVERY_APP_ID` = App ID;
   - `DELIVERY_APPROVERS` = `v-mendelev` (необязательно; по умолчанию владелец);
   - последним — `DELIVERY_REPOSITORY` = `v-mendelev/anna-portfolio`
     (**выключатель**: без него конвейер ничего не делает).
5. **Settings → General → Pull Requests:** ☑ _Allow auto-merge_;
   ☐ _Automatically delete head branches_ — **выключено** (его заменяет
   выборочная очистка; иначе GitHub пытался бы удалять `dev`/`main` как head
   promotion/sync PR). Merge commits и squash оставить разрешёнными.
6. **Rulesets — не ослаблять.** Проверено (публичный API, 2026-11-24): `main` и
   `dev` — запрет удаления и force-push, только PR, обязательный `CI passed`;
   у `main` strict («up to date»). Рекомендуемое **усиление**: убрать у
   `Protect dev` bypass для роли Admin (`.github/rulesets/dev.json` уже без
   него) — Settings → Rules → Protect dev → Bypass list → удалить. App в bypass
   **не добавлять**.
7. Первый запуск: _Actions → Delivery · promote → Run workflow_ (ветка `main`).
   `dev` сейчас «отстаёт» от `main` на squash-коммит #2 с идентичным
   содержимым — конвейер сам откроет и смёржит sync PR `main → dev`.
8. Проверка: безвредный тестовый PR (например, правка комментария в
   `README.md`) по полной цепочке. Дизайн-ветки для теста не использовать.

Откат активации: удалить переменную `DELIVERY_REPOSITORY` (всё снова вручную);
полностью — удалить App (Settings → Applications → Installed GitHub Apps) и
окружение `delivery`.

## Команда публикации для Claude Code

Подготовка (всегда, без одобрения): ветка `feature/<имя>` от свежего
`origin/dev`, изменения, `pnpm verify`, коммит, `git push -u origin feature/<имя>`
(через `github-personal`), `gh pr create --repo v-mendelev/anna-portfolio --base dev`.

Публикация — **только после явной фразы владельца в чате с номером PR**,
например «Одобряю публикацию PR #12». PowerShell, PAT введён через
`Read-Host -AsSecureString` в `$env:GH_TOKEN` процесса:

```powershell
$pr = 12
$sha = git rev-parse HEAD   # коммит, прошедший pnpm verify
$head = gh pr view $pr --repo v-mendelev/anna-portfolio --json headRefOid --jq .headRefOid
if ($sha -ne $head) { throw "PR head $head != verified commit $sha" }
gh pr comment $pr --repo v-mendelev/anna-portfolio --body "/publish-approve $sha"
```

Наблюдение (чтение, PAT не нужен):

```powershell
gh pr checks $pr --repo v-mendelev/anna-portfolio --watch
curl.exe -s https://api.github.com/repos/v-mendelev/anna-portfolio/commits/main/status
```

Успех = в `main` статус `delivery/live: success` с URL сайта. Fine-grained PAT
для этого нужен только с **Pull requests: Read & write** (и Metadata: Read) —
те же права, что для создания PR.

## Сбои и откат

| Что сломалось                        | Что происходит                                                                  | Что делать                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Одобрение отклонено                  | комментарий App с причинами, run красный, ничего не смёржено                    | исправить причину, одобрить новый head                                                           |
| CI красный на feature PR             | auto-merge ждёт; PR открыт                                                      | новые коммиты (auto-merge выключится) → снова verify → новое одобрение                           |
| Promotion заблокирован               | PR `dev → main` открыт без auto-merge, `delivery/promotion: failure` с причиной | смёржить вручную после просмотра или одобрить смёрженный PR и перезапустить _Delivery · promote_ |
| `main` содержит то, чего нет в `dev` | sync не создаётся, run красный (`sync-blocked`)                                 | вручную PR `main → dev`                                                                          |
| Ошибка API / сеть посреди запуска    | run красный; всё SHA-привязано и идемпотентно, повтор безопасен                 | Re-run job                                                                                       |
| Деплой или live smoke упал           | `Deploy demo…` красный, `delivery/live: failure`, письмо от GitHub              | откат (ниже)                                                                                     |

Откат сайта: (1) Actions → _Deploy demo to GitHub Pages_ → Run workflow → `ref` =
SHA последней рабочей версии (виден в `delivery/live: success` в истории `main`);
(2) или `git revert` в новой `feature/*` ветке → тот же путь одобрения —
конвейер сам доставит откат до Pages.

## Известные ограничения и усиление

Учтено по итогам security-ревью:

- **Auto-merge в GitHub проверяет SHA только при включении.** Если после этого
  кто-то с правом записи запушит в PR, GitHub auto-merge не снимет — это делает
  `delivery-pr.yml` через секунды после push (CI идёт минуты). Promotion работает
  с отказом в безопасную сторону: каждый запуск **сначала выключает** auto-merge
  promotion PR и включает его заново (на текущий SHA dev) только при успешном
  решении «promote». Сбой, таймаут или ранний выход оставляют auto-merge выключенным.
- Перенаправление одобренного PR из `dev` в другую базу (`edited`) снимает auto-merge.
- Скрипты с ключом App статически импортируют только `src/lib/delivery/` и
  встроенные модули Node (маршруты для live smoke грузятся лениво, без ключа);
  actions в этих job закреплены по SHA коммита (Dependabot их обновляет).
- Promotion сопоставляет коммиты `dev` с PR по `merge_commit_sha` среди последних
  100 смёрженных в `dev` PR. Поэтому merge в `dev` должен быть **squash** (так
  делает конвейер); PR, смёрженные вручную merge-коммитом/rebase, а также
  диапазоны > 100 коммитов блокируют promotion (отказ в безопасную сторону →
  ручной merge).
- Удаление ветки: между проверкой SHA ветки и удалением — миллисекунды; push в
  это окно теоретически потеряется (ветка всё равно уже смёржена).
- **Рекомендуемое усиление rulesets** (не ослабляет, применять только после
  согласования):
  - в обоих rulesets закрепить check `CI passed` за GitHub Actions
    (`"integration_id": 15368`), чтобы его не мог «подделать» статусом другой
    источник;
  - убрать Admin bypass у `Protect dev` (см. выше);
  - строже, но меняет ручной процесс: сделать `delivery/approval` обязательным
    статусом в `Protect dev` (закреплённым за App) — тогда в `dev` не попадёт ничего
    без одобрения даже при сбое workflow, но и ручные PR (в т.ч. Dependabot)
    потребуют `/publish-approve`.

## Тесты

Логика решений — `src/lib/delivery/*.test.ts` (Vitest, in-memory GitHub,
`testing.ts`): одобренный PR с зелёным CI мёржится; красный CI блокирует;
неавторизованные/поддельные одобрения игнорируются; Dependabot/форки/draft
никогда; новые коммиты после одобрения снимают auto-merge; `feature/*`
удаляется после merge, `dev`/`main` и неслитые ветки — никогда; promotion
только при полностью одобренном диапазоне; посторонние коммиты в `dev`
блокируют promotion; дубликаты событий не дают второго merge; сбой API
останавливает без merge; sync не зацикливается. Live smoke — `live.test.ts`
(SHA, 200, CSS/JS/шрифты). Проводка workflow и их безопасность —
`tests/unit/delivery-workflows.test.ts`.

## Перенос в другой проект

Код не содержит данных клиента: всё берётся из переменных `DELIVERY_*`.
Скопировать `src/lib/delivery/`, `scripts/delivery/`, три `delivery-*.yml`,
шаги `build-info.json`/`verify` из `deploy-pages.yml`, этот файл; создать
отдельный App на каждый репозиторий (или установить один App только на
нужные репозитории) и выполнить «Разовую настройку». Маршруты для live smoke
берутся из `tests/e2e/routes.ts`.
