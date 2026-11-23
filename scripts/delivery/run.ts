/**
 * CI entry point for the delivery pipeline (runs with plain `node`, no install:
 * Node strips TypeScript types natively and only built-in modules are used, so
 * no third-party code runs next to the App's private key).
 *
 *   node scripts/delivery/run.ts approve        # issue_comment
 *   node scripts/delivery/run.ts pull-request   # pull_request_target
 *   node scripts/delivery/run.ts promote        # push dev/main, workflow_dispatch
 *   node scripts/delivery/run.ts live-smoke     # after the Pages deploy
 *
 * Env: GITHUB_REPOSITORY, GITHUB_EVENT_PATH, GITHUB_STEP_SUMMARY (set by Actions),
 * DELIVERY_REPOSITORY (activation switch), DELIVERY_APPROVERS, DELIVERY_APP_ID,
 * DELIVERY_APP_PRIVATE_KEY (secret). live-smoke: PAGE_URL, EXPECTED_SHA.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { handleApprovalComment, type IssueCommentEvent } from '../../src/lib/delivery/approve.ts';
import { DeliveryNotActivatedError, loadDeliveryConfig } from '../../src/lib/delivery/config.ts';
import { formatLiveReport, runLiveCheck } from '../../src/lib/delivery/live.ts';
import { runPromotion } from '../../src/lib/delivery/promote.ts';
import {
  handlePullRequestEvent,
  type PullRequestEvent,
} from '../../src/lib/delivery/pull-request-event.ts';
import { createGitHubApi, createInstallationToken } from '../../src/lib/delivery/rest.ts';
import type { Logger } from '../../src/lib/delivery/types.ts';

const log: Logger = {
  info: (message) => process.stdout.write(`${message}\n`),
  warn: (message) => process.stdout.write(`::warning::${message}\n`),
};

function summary(markdown: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, `${markdown}\n`);
  process.stdout.write(`${markdown}\n`);
}

function readEvent<T>(): T {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) throw new Error('GITHUB_EVENT_PATH is not set.');
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

async function liveSmoke(): Promise<number> {
  // Imported lazily: commands that hold the App key must load only
  // pipeline code (src/lib/delivery, scripts/delivery — manual-merge-only paths).
  const { ROUTES } = await import('../../tests/e2e/routes.ts');
  const pageUrl = requireEnv('PAGE_URL');
  const report = await runLiveCheck({
    baseUrl: pageUrl,
    routes: ROUTES.map((r) => r.path),
    expectedSha: requireEnv('EXPECTED_SHA'),
    fetch: (url) => fetch(url, { redirect: 'follow', headers: { 'Cache-Control': 'no-cache' } }),
  });
  summary(formatLiveReport(report, pageUrl));
  return report.ok ? 0 : 1;
}

async function withApp(command: string): Promise<number> {
  const cfg = loadDeliveryConfig(process.env);
  const app = await createInstallationToken({
    appId: requireEnv('DELIVERY_APP_ID'),
    privateKey: requireEnv('DELIVERY_APP_PRIVATE_KEY'),
    repository: cfg.repository,
  });
  try {
    const ctx = {
      api: createGitHubApi({ token: app.token, repository: cfg.repository }),
      cfg,
      appBotLogin: app.botLogin,
      log,
    };
    if (command === 'approve') {
      const outcome = await handleApprovalComment(readEvent<IssueCommentEvent>(), ctx);
      summary(`Delivery approve: \`${JSON.stringify(outcome)}\``);
      return outcome.status === 'rejected' ? 1 : 0;
    }
    if (command === 'pull-request') {
      const outcome = await handlePullRequestEvent(readEvent<PullRequestEvent>(), ctx);
      summary(`Delivery pull request: \`${JSON.stringify(outcome)}\``);
      return 0;
    }
    const outcome = await runPromotion(ctx);
    summary(`Delivery promote: \`${JSON.stringify(outcome)}\``);
    return outcome.status === 'sync-blocked' ? 1 : 0;
  } finally {
    await app
      .revoke()
      .catch(() => log.warn('Could not revoke the installation token (it expires within 1 h).'));
  }
}

async function main(): Promise<number> {
  const command = process.argv[2] ?? '';
  if (command === 'live-smoke') return liveSmoke();
  if (!['approve', 'pull-request', 'promote'].includes(command)) {
    throw new Error(`Unknown command "${command}".`);
  }
  try {
    return await withApp(command);
  } catch (error) {
    if (error instanceof DeliveryNotActivatedError) {
      log.info(`::notice::${error.message}`);
      return 0;
    }
    throw error;
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    // Error messages never contain tokens or keys (see rest.ts).
    console.error(error instanceof Error ? error.message : 'Delivery step failed.');
    process.exitCode = 1;
  },
);
