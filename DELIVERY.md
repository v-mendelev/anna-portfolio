# Автоматическая доставка: feature → dev → main → Pages

Конвейер публикует **одобренное** изменение без ручных кликов в GitHub:

```
feature/x ──PR──▶ dev ──PR (promotion)──▶ main ──▶ GitHub Pages ──▶ live smoke
   │  ▲    ▲        │  ▲                      │
   │  │    └ CI passed (workflow_run) → App мёржит ровно одобренный SHA
   │  └ /publish-approve <SHA> (владелец)     └─ sync PR main → dev (без изменений файлов)
   └─ после merge ветка удаляется (на push в dev)
```

Статус: GitHub App, окружение `delivery` и переменные настроены; конвейер
активен, пока задана переменная `DELIVERY_REPOSITORY`. Без неё все workflow
`delivery-*` пропускаются, и всё работает вручную.

## Как это работает

| Шаг | Кто/что                                | Механизм                                                                                                                                                                                          |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Claude Code                            | ветка `feature/*`, `pnpm verify`, push (SSH `github-personal`), PR в `dev`                                                                                                                        |
| 2   | Владелец в чате Claude Code → Claude   | комментарий в PR ровно `/publish-approve <полный SHA head>`                                                                                                                                       |
| 3   | `delivery-approve.yml` (issue_comment) | проверяет автора, PR и SHA → пишет commit status `delivery/approval` (от App) на этот SHA с номером PR, автором и id комментария → если CI этого SHA уже зелёный, сразу мёржит (squash)           |
| 4   | `delivery-merge.yml` (workflow_run)    | CI завершился успешно для `feature/*` PR → заново проверяет одобрение и CI **текущего** head → App мёржит (squash) с `sha` = одобренный SHA                                                       |
| 5   | `delivery-promote.yml` (CI push в dev) | один PR `dev → main`: каждый коммит `main..dev` должен быть из одобренного PR или нейтральным → native auto-merge (merge commit) на точный SHA dev; удаляет смёрженные конвейером `feature/*`     |
| 6   | GitHub                                 | после зелёного CI на promotion PR мёржит в `main`                                                                                                                                                 |
| 7   | `deploy-pages.yml` (push в main)       | CI → сборка с `build-info.json` (SHA) → deploy → **live smoke**: SHA на сайте = SHA коммита, 200 на всех маршрутах из `tests/e2e/routes.ts`, все CSS/JS/шрифты 200 → status `delivery/live` с URL |
| 8   | `delivery-promote.yml` (push в main)   | `main` требует «up to date» веток, поэтому merge-коммит из main возвращается в dev через sync PR — только если это не меняет ни одного файла; затем цикл останавливается (`nothing to promote`)   |

PR, merge и удаление веток выполняются **токеном GitHub App**, поэтому события
от них запускают CI и деплой Pages (события от `GITHUB_TOKEN` workflow не
запускают). Для feature PR native auto-merge **не используется**: App мёржит сам,
только когда все условия выполнены прямо сейчас.

### Что НЕ мёржится автоматически

- PR без одобрения; с одобрением другого SHA (новые коммиты до или после
  одобрения); с одобрением, записанным на другой PR; draft; из форка; не из
  `feature/*`; не в `dev` (в т.ч. перенаправленный после одобрения); от ботов и
  **Dependabot**; с конфликтом слияния.
- PR, меняющие `.github/`, `scripts/delivery/`, `src/lib/delivery/` — сам
  конвейер и workflow меняются только ручным merge.
- PR, у которого последний CI-прогон (`ci.yml`, событие `pull_request`) для
  текущего head ещё идёт, не найден или упал.
- Promotion, если в `dev` есть хоть что-то неодобренное: прямой push, PR,
  смёрженный вручную без одобрения, Dependabot. Тогда promotion PR остаётся
  открытым **без auto-merge**, в описании и в статусе `delivery/promotion`
  перечислено, что мешает. Решение — смёржить вручную после просмотра или
  одобрить соответствующий смёрженный PR (`/publish-approve <его head SHA>`,
  затем Actions → _Delivery · promote_ → Run, либо дождаться следующего push в dev).
- Rulesets действуют и для App (bypass у App нет): красный `CI passed` = нет merge.

## Механизм одобрения (точно)

1. **Команда.** Комментарий в PR **ровно** `/publish-approve <40-символьный SHA>`
   (без текста вокруг; регистр SHA не важен). Job одобрения запускается
   **только** для комментария самого владельца репозитория: аутентифицированный
   логин автора = `github.repository_owner`, тип аккаунта `User` (не бот).
   Скрипт дополнительно требует логин из `DELIVERY_APPROVERS` (по умолчанию —
   владелец); владелец опознаётся по логину, любой другой approver — ещё и по
   `author_association` OWNER/MEMBER/COLLABORATOR. Команды остальных
   игнорируются без ответа. (Причина: на PR #11 job с проверкой только
   `author_association` пропустил комментарий владельца.)
2. **Проверка при одобрении** (`approve.ts`, `evaluateApproval`): событие из
   активированного репозитория; PR из этого же репозитория (не форк), база
   `dev`, ветка `feature/*`, автор не бот/Dependabot, не draft, SHA = текущий
   head, нет файлов конвейера/workflow, diff не обрезан. Иначе — ответ App
   «Publish approval rejected» с причинами, ничего не записано.
3. **Запись одобрения.** App ставит на этот SHA commit status
   `delivery/approval` = success с описанием
   `Approved PR #<номер> by <логин> (comment <id>)` и ссылкой на комментарий.
   Так одобрение привязано к **репозиторию** (статус живёт в нём), **SHA**
   (на нём стоит), **номеру PR**, **автору** и **комментарию**.
4. **Проверка перед merge** (`merge.ts`, `evaluateMerge`) — каждый раз заново из
   API, причём дважды: перед решением и ещё раз сразу перед вызовом merge:
   - PR открыт, не draft, не форк, база `dev`, ветка `feature/*`, автор не
     бот/Dependabot, нет файлов конвейера/workflow;
   - head PR = SHA, о котором идёт речь (иначе `stale`);
   - самый новый статус `delivery/approval` на этом SHA, **созданный ботом
     App**, — success, в новом формате и называет **этот** PR;
   - комментарий из записи существует, находится в **этом** PR, его текст —
     `/publish-approve <текущий head>` (правка комментария после одобрения
     аннулирует одобрение), автор — тот же логин и по-прежнему разрешённый
     approver с write-доступом;
   - CI: самый новый прогон `.github/workflows/ci.yml` с событием
     `pull_request` для этого SHA, этой ветки, этого репозитория, который
     GitHub связывает с **этим PR как PR в `dev`**, завершён успешно, и в
     check suite **именно этого прогона** есть `CI passed` от `github-actions`
     со статусом success.
5. **Merge.** `PUT /pulls/{n}/merge` с `sha` = одобренный SHA и методом
   squash: GitHub сам откажет, если head сдвинулся, а rulesets (обязательный
   `CI passed`) проверяются ещё раз на стороне GitHub.

Повторное одобрение того же SHA допустимо (пишется новая запись). Новые коммиты
требуют нового одобрения: запись стоит на старом SHA, а merge проверяет текущий.

### Граница доверия

- **Доверено:** код из ветки по умолчанию (`main`) — только он исполняется
  в job с ключом App; GitHub API как источник фактов; бот App как единственный
  автор записей `delivery/approval`; аккаунты из `DELIVERY_APPROVERS`.
- **Не доверено:** код PR (никогда не checkout'ится и не исполняется в
  привилегированных job), payload событий (используется только как «повод»:
  run и PR перечитываются из API), тексты PR/комментариев/названия веток (не
  попадают в shell), статусы от других источников (игнорируются — не могут ни
  дать, ни «перекрыть» одобрение), артефакты (не скачиваются вовсе).
- **Ключ App** лежит в окружении `delivery`. Все job'ы с ним исполняют только
  workflow и код ветки по умолчанию: issue_comment и workflow_run — всегда из
  `main`, promotion — по push в `main` или по завершении CI push-прогона `dev`
  (workflow_run), а не по `push: dev`, при котором исполнялась бы копия файла
  из `dev`. Дополнительно каждый job требует `github.ref` = ветка по умолчанию.
  Окружение следует ограничить веткой **`main`** (см. «Миграция») — тогда
  ключ недоступен никакому коду, кроме прошедшего в `main`. Workflow из
  feature-ветки ключ не получит, поэтому не может подделать одобрение.
- **Честно о границе:** GitHub видит только, что комментарий оставлен
  аккаунтом владельца (через его fine-grained PAT). Он **не может проверить**,
  что владелец действительно сказал «да» в чате Claude Code. Это обеспечивается
  правилом в `CLAUDE.md` (Claude пишет `/publish-approve` только после явного
  одобрения конкретного PR в чате) и тем, что PAT вводится вручную на сессию
  (`Read-Host -AsSecureString`, только `GH_TOKEN` процесса). Кто держит PAT
  владельца, может одобрить публикацию. Для более строгой схемы одобряйте
  сами — тот же комментарий в веб-интерфейсе GitHub или с телефона.
- Admin bypass у живого `Protect dev` владелец **оставил намеренно**
  (`.github/rulesets/dev.json` — без него). Конвейер и агенты им не пользуются:
  всё идёт только через PR и `CI passed`.

## Безопасность событий workflow

`pull_request_target` не используется: с 2 декабря 2026 GitHub блокирует его по
умолчанию в публичных репозиториях, а исключение в политике Actions не нужно.

| Workflow               | Событие                                                                | Какой код исполняется                  | Права `GITHUB_TOKEN`                  | Ключ App |
| ---------------------- | ---------------------------------------------------------------------- | -------------------------------------- | ------------------------------------- | -------- |
| `delivery-approve.yml` | `issue_comment: created`                                               | ветка по умолчанию                     | `contents`, `actions`, `checks`: read | да       |
| `delivery-merge.yml`   | `workflow_run` (CI, `completed`, `feature/**`)                         | ветка по умолчанию                     | `contents`, `actions`, `checks`: read | да       |
| `delivery-promote.yml` | `push` в `main`; `workflow_run` (CI push в `dev`); `workflow_dispatch` | ветка по умолчанию                     | `contents: read`                      | да       |
| `ci.yml`               | `pull_request` в `dev`/`main`                                          | merge-коммит PR (код PR, без секретов) | `contents: read`                      | нет      |

- Во всех `delivery-*`: `permissions: {}` по умолчанию; checkout только ветки
  по умолчанию, без `ref:`, `persist-credentials: false`; без установки
  зависимостей (только встроенные модули Node); actions закреплены по SHA;
  выражения `${{ }}` не подставляются в shell; без артефактов и кэшей.
- `delivery-merge.yml` дополнительно отсекает на уровне job: прогон успешный,
  событие `pull_request`, head-репозиторий = этот репозиторий. Затем скрипт
  перечитывает run по id и требует: путь `ci.yml`, событие `pull_request`,
  статус success, тот же SHA, что в событии, ветка `feature/*`.
- `GITHUB_TOKEN` используется **только для чтения** результатов CI (у App нет
  прав Actions/Checks, и они не добавляются). Всё, что пишет, — токен App.
- Параллельность задана **на уровне job**, т.е. только для запусков, прошедших
  `if:`: чужие комментарии и прогоны форков в очередь не попадают и не могут
  вытеснить одобрение. approve — одна очередь на PR, merge — на ветку,
  promotion — одна общая; идущие запуски не отменяются. Дубликаты и гонки
  безопасны: merge привязан к SHA, второй вызов видит PR уже смёрженным
  (`already-merged`). Если GitHub заменит ожидающий запуск более новым из той же
  очереди, решает более новый; потерянное одобрение достаточно повторить.

## Права

**GitHub App (минимальные, без изменений):**

| Право (Repository)                                                 | Уровень      | Зачем                                                                                |
| ------------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------ |
| Contents                                                           | Read & write | merge PR, удаление смёрженных `feature/*` веток                                      |
| Pull requests                                                      | Read & write | promotion и sync PR, auto-merge promotion, комментарии, чтение комментария-одобрения |
| Commit statuses                                                    | Read & write | `delivery/approval`, `delivery/promotion`                                            |
| Metadata                                                           | Read         | обязательное                                                                         |
| Workflows, Actions, Checks, Administration, Issues, Secrets, Pages | **нет**      | не нужны; PR с изменениями workflow мёржатся вручную                                 |

Токен установки выпускается на каждый запуск, только на этот репозиторий и
только с правами выше, хранится в памяти процесса, по окончании отзывается
(`DELETE /installation/token`), живёт ≤ 1 ч. Webhook у App не нужен. Перед
выпуском токена `DELIVERY_APP_ID` и `DELIVERY_APP_PRIVATE_KEY` проверяются на
наличие и формат (без вывода значений) — неверные данные останавливают run до
любых действий.

**`GITHUB_TOKEN` в approve/merge:** `actions: read`, `checks: read`,
`contents: read` — чтение прогонов и check runs. Секретов и прав записи нет.

## Разовая настройка

Выполнено владельцем: App (права — таблица выше), установка на репозиторий,
окружение `delivery` (ветки `main`, `dev`) с секретом `DELIVERY_APP_PRIVATE_KEY`,
переменные `DELIVERY_APP_ID`, `DELIVERY_APPROVERS`, `DELIVERY_REPOSITORY`.
Новых секретов, переменных и прав App эта версия не требует; после перехода
окружение сужается до `main` (усиление, «Миграция», шаг 5).

Для новой установки (другой репозиторий) — по порядку:

1. **GitHub App** — Settings (профиля) → Developer settings → GitHub Apps → New:
   Webhook **выключен**; Repository permissions — ровно как в таблице; остальное
   «No access»; _Only on this account_; записать **App ID**, создать private key.
2. **Установить App** → _Only select repositories_ → нужный репозиторий.
3. **Окружение `delivery`** — Deployment branches: **Selected** → только `main`;
   без required reviewers; секрет `DELIVERY_APP_PRIVATE_KEY` = `.pem` целиком
   (затем удалить `.pem` с диска).
4. **Repository variables:** `DELIVERY_APP_ID`; `DELIVERY_APPROVERS`
   (необязательно); последним — `DELIVERY_REPOSITORY` = `owner/repo` (выключатель).
5. **Settings → General → Pull Requests:** ☑ _Allow auto-merge_ (нужен для
   promotion и sync PR); ☐ _Automatically delete head branches_ — **выключено**
   (иначе GitHub удалял бы `dev`/`main` как head promotion/sync PR). Merge
   commits и squash оставить разрешёнными.
6. **Rulesets — не ослаблять.** `main` и `dev`: запрет удаления и force-push,
   только PR, обязательный `CI passed`; у `main` strict. App в bypass **не
   добавлять**.
7. Первый запуск: _Actions → Delivery · promote → Run workflow_ (ветка `main`).
   Если деревья `main` и `dev` совпадают, запуск ничего не создаёт и не мёржит.
8. Проверка — «Реальная проверка от начала до конца» ниже.

Отключение: удалить переменную `DELIVERY_REPOSITORY` (всё снова вручную);
полностью — удалить App (Settings → Applications → Installed GitHub Apps) и
окружение `delivery`.

## Миграция с прежней схемы

Прежняя версия включала native auto-merge при одобрении и держала «сторожа»
`delivery-pr.yml` на `pull_request_target` (снимал auto-merge при новых
коммитах/draft/смене базы и удалял ветку после merge). Изменения:

| Было                                                          | Стало                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| auto-merge с `expectedHeadOid` (SHA проверялся при включении) | App мёржит сам с `sha` после полной проверки текущего состояния                            |
| `delivery-pr.yml` снимал auto-merge после push                | не нужен: новый head не имеет одобрения → merge не происходит                              |
| `delivery-pr.yml` (closed) удалял ветку                       | `delivery-promote.yml` (после CI push в dev) удаляет только ветки, смёрженные с одобрением |
| `delivery-promote.yml` по `push: [dev, main]` (код из `dev`)  | по `push: [main]` и `workflow_run` CI push в `dev` — всегда код `main`                     |
| concurrency на уровне workflow (чужие запуски в очереди)      | concurrency на уровне job — только после `if:`                                             |
| запись `Approved by X (comment N)` (без номера PR)            | `Approved PR #N by X (comment M)`; старые записи **не принимаются**                        |
| `GITHUB_TOKEN` не использовался                               | только чтение результатов CI (`actions`/`checks`: read)                                    |

Порядок перехода (этот PR меняет `.github/` и код конвейера — merge только
ручной, с одобрения владельца):

1. Смёржить этот PR в `dev` вручную (squash), затем promotion `dev → main`
   вручную, merge commit. Конвейер такие PR сам не мёржит.
2. `workflow_run` и `issue_comment` берут workflow из `main`, поэтому новая
   схема заработает только после попадания в `main`. До этого действует старая.
3. Одобрения, сделанные до перехода (старый формат записи), после перехода не
   засчитываются — открытые PR нужно одобрить заново.
4. После перехода: если на открытом feature PR остался включённый native
   auto-merge от старой схемы, выключить его вручную (кнопка _Disable
   auto-merge_) — новая схема его не использует и не снимает.
5. После того как эта версия в `main`: Settings → Environments → `delivery` →
   Deployment branches → оставить **только `main`** (убрать `dev`). Это
   усиление: все job'ы с ключом теперь исполняются из `main`, а workflow из
   `dev` больше не смогут получить ключ.
6. Обязательно до 2 декабря 2026: после этой даты старый `delivery-pr.yml`
   перестаёт запускаться, а auto-merge старой схемы не снимается при новых
   коммитах. Если переход не успевает — удалить переменную `DELIVERY_REPOSITORY`.

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
для этого нужен только с **Pull requests: Read & write** (и Metadata: Read).

## Сбои и восстановление

Любая ошибка API, неполные или противоречивые данные, отсутствие одобрения или
CI → **ничего не мёржится** (run красный или PR просто остаётся открытым).

| Что произошло                         | Что происходит                                                                     | Что делать                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Одобрение отклонено                   | ответ App с причинами, run красный, ничего не записано                             | исправить причину, одобрить новый head                                                           |
| CI ещё идёт при одобрении             | одобрение записано, ответ «merges when CI passes»                                  | ничего: merge сделает `delivery-merge.yml`                                                       |
| CI красный                            | одобрение записано, merge нет                                                      | перезапустить CI (успех → merge) или новые коммиты → verify → новое одобрение                    |
| Новые коммиты после одобрения         | старый SHA больше не head (`stale`), новый не одобрен — merge нет                  | verify → одобрить новый head                                                                     |
| PR перенаправлен / draft / конфликт   | `not-approved` или `not-mergeable` (комментарий App), merge нет                    | вернуть базу `dev` / снять draft / разрешить конфликт → новый head → одобрить                    |
| Сбой `Delivery · merge` (сеть, API)   | run красный, PR открыт, одобрение остаётся                                         | Re-run job; или повторить `/publish-approve <тот же SHA>` (CI уже зелёный → merge сразу)         |
| Неверные или отсутствующие данные App | run красный до любых действий (`DELIVERY_APP_*`, «Cannot authenticate as the App») | исправить переменную/секрет в окружении `delivery`, Re-run                                       |
| Promotion заблокирован                | PR `dev → main` открыт без auto-merge, `delivery/promotion: failure` с причиной    | смёржить вручную после просмотра или одобрить смёрженный PR и перезапустить _Delivery · promote_ |
| `main` содержит то, чего нет в `dev`  | sync не создаётся, run красный (`sync-blocked`)                                    | вручную PR `main → dev` (merge commit)                                                           |
| Деплой или live smoke упал            | `Deploy demo…` красный, `delivery/live: failure`, письмо от GitHub                 | откат (ниже)                                                                                     |

Откат сайта: (1) Actions → _Deploy demo to GitHub Pages_ → Run workflow → `ref` =
SHA последней рабочей версии (виден в `delivery/live: success` в истории `main`);
(2) или `git revert` в новой `feature/*` ветке → тот же путь одобрения —
конвейер сам доставит откат до Pages.

## Реальная проверка от начала до конца

Безвредное изменение (например, текст в `DELIVERY.md`), не дизайн-ветки.
Первый прогон новой схемы — 2026-11-24 (PR #11).

1. Ветка `feature/delivery-e2e-<дата>` от `origin/dev`, изменение, `pnpm verify`,
   push, PR в `dev`. Ожидается: CI зелёный, `Delivery · merge` запускается и
   завершается `not-approved` — PR **не** смёржен.
2. Второй коммит в ту же ветку; комментарий `/publish-approve <SHA первого
коммита>`. Ожидается: «Publish approval rejected … not the current head»,
   нет статуса `delivery/approval`, нет merge.
3. Явное одобрение владельца в чате → `/publish-approve <текущий head>`.
   Ожидается: статус `delivery/approval` от App с `Approved PR #N …`; merge
   (squash) в `dev` сразу (CI уже зелёный) или после CI.
4. Push в dev → CI push-прогона `dev` → `Delivery · promote`: promotion PR `dev → main`,
   `delivery/promotion: success`, auto-merge; удалена **только** эта
   `feature/*` ветка.
5. CI на promotion PR → merge commit в `main` → `Deploy demo to GitHub Pages` →
   `delivery/live: success`; `build-info.json` на сайте содержит SHA `main`.
6. Push в main → sync PR `main → dev` (merge commit, без изменений файлов) →
   следующий `Delivery · promote` — «nothing to promote».
7. Проверить: rulesets `main`/`dev` активны и не изменены; нет открытых PR,
   кроме ожидаемых; `feature/design-v2-concepts` не тронута.

## Известные ограничения и усиление

- Одобрение не истекает: одобренный SHA с красным CI смёржится, если CI этого же
  SHA позже пройдёт (это тот же одобренный код).
- Promotion сопоставляет коммиты `dev` с PR по `merge_commit_sha` среди последних
  100 смёрженных в `dev` PR, поэтому merge в `dev` — **squash** (так делает
  конвейер); PR, смёрженные вручную merge-коммитом/rebase, а также диапазоны
  > 100 коммитов блокируют promotion (отказ в безопасную сторону → ручной merge).
- Промежуток между последней проверкой и merge — доли секунды; смену head GitHub
  отсечёт сам (`sha`), смену базы в этот промежуток — нет (крайне маловероятно).
- Удаление ветки: между проверкой SHA ветки и удалением — миллисекунды; push в
  это окно теоретически потеряется (ветка уже смёржена).
- Связь CI-прогона с PR берётся из GitHub (`pull_requests` прогона — открытые
  PR с тем же head, с их текущей базой). Прогон, сделанный, пока PR был
  направлен в `main`, после смены базы на `dev` засчитается (так же поступает и
  сам ruleset `CI passed`). Смена базы не перезапускает CI — при сомнении
  перезапустите CI перед одобрением.
- Чтение статусов коммита — до 1000 (10 страниц); больше → отказ (без merge).
- Флаг rulesets `require_extra_approval_for_unattributed_changes` включён; его
  влияние на merge от App подтверждается только реальной проверкой.
- **Рекомендуемое усиление rulesets** (не ослабляет, только после согласования):
  закрепить `CI passed` за GitHub Actions (`"integration_id": 15368`) в обоих
  rulesets; строже — сделать `delivery/approval` обязательным статусом
  `Protect dev`, закреплённым за App (тогда ручные PR, sync и Dependabot тоже
  потребуют записи от App — нужна доработка кода).

## Тесты

Логика решений — `src/lib/delivery/*.test.ts` (Vitest, in-memory GitHub,
`testing.ts`): одобрение + зелёный CI → merge ровно этого SHA; CI уже зелёный →
merge сразу; устаревший SHA; одобрение другого PR; новые коммиты после
одобрения; красный и незавершённый CI; перенаправление на `main`; draft, форк,
Dependabot, неавторизованные одобряющие; изменения workflow/конвейера;
поддельный статус; изменённый/удалённый комментарий; чужие CI-прогоны; изменения
состояния во время проверки; дубликаты `workflow_run` и гонка с одобрением —
ровно один merge; конфликт слияния; сбои API (ничего не смёржено); удаление
только смёрженных конвейером `feature/*`; неверные данные App. Правила
CI/одобрения по отдельности — `merge-gate.test.ts`. Promotion, sync, live
smoke (`live.test.ts`), JWT/токен App (`rest.test.ts`). Проводка workflow —
`tests/unit/delivery-workflows.test.ts` (нет `pull_request_target`,
`workflow_run` только в `delivery-merge.yml`, только чтение у `GITHUB_TOKEN`,
нет артефактов, нет кода PR).

## Перенос в другой проект

Код не содержит данных клиента: всё берётся из переменных `DELIVERY_*`.
Скопировать `src/lib/delivery/`, `scripts/delivery/`, три `delivery-*.yml`,
шаги `build-info.json`/`verify` из `deploy-pages.yml`, этот файл; создать
отдельный App на каждый репозиторий (или установить один App только на
нужные репозитории) и выполнить «Разовую настройку». Маршруты для live smoke
берутся из `tests/e2e/routes.ts`. Имя CI-workflow (`CI`, файл `ci.yml`) и
обязательной проверки (`CI passed`) — в `config.ts`.
